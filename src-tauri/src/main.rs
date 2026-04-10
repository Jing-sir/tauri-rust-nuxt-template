#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};

use futures_util::StreamExt;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tokio::{
    sync::{oneshot, oneshot::error::TryRecvError, Mutex},
    time::{sleep, timeout, Duration, Instant},
};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const DEFAULT_RECONNECT_BASE_DELAY_MS: u64 = 800;
const DEFAULT_RECONNECT_MAX_DELAY_MS: u64 = 20_000;
const DEFAULT_SECURE_SERVICE: &str = "com.xiangnan.tradingdesktop.credentials";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSubscription {
    channel: String,
    topic: Option<String>,
    params: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEventPayload {
    #[serde(rename = "type")]
    event_type: String,
    channel: String,
    timestamp: i64,
    payload: Value,
    sequence: Option<u64>,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConnectionStatePayload {
    state: String,
    source: String,
    timestamp: i64,
}

struct SubscriptionWorker {
    stop_tx: oneshot::Sender<()>,
}

#[derive(Default)]
struct RuntimeState {
    workers: Mutex<HashMap<String, SubscriptionWorker>>,
}

fn now_unix_millis() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis() as i64,
        Err(_) => 0,
    }
}

fn value_to_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|num| u64::try_from(num).ok()))
        .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
}

fn extract_sequence(payload: &Value) -> Option<u64> {
    payload
        .get("sequence")
        .and_then(value_to_u64)
        .or_else(|| payload.get("u").and_then(value_to_u64))
        .or_else(|| payload.get("E").and_then(value_to_u64))
}

fn emit_connection_state(app: &AppHandle, state: &str) {
    let payload = RuntimeConnectionStatePayload {
        state: state.to_string(),
        source: "rust-runtime".to_string(),
        timestamp: now_unix_millis(),
    };

    if let Err(error) = app.emit("runtime.connection.state", payload) {
        eprintln!("failed to emit runtime.connection.state: {error}");
    }
}

fn emit_runtime_event(app: &AppHandle, channel: &str, payload: Value) {
    let event_payload = RuntimeEventPayload {
        event_type: "runtime.event".to_string(),
        channel: channel.to_string(),
        timestamp: now_unix_millis(),
        sequence: extract_sequence(&payload),
        payload,
        source: "rust-runtime".to_string(),
    };

    if let Err(error) = app.emit("runtime.event", event_payload) {
        eprintln!("failed to emit runtime.event: {error}");
    }
}

fn subscription_key(subscription: &RuntimeSubscription) -> String {
    format!(
        "{}:{}:{}",
        subscription.channel,
        subscription.topic.clone().unwrap_or_default(),
        subscription
            .params
            .as_ref()
            .map_or_else(|| "{}".to_string(), Value::to_string)
    )
}

fn resolve_topic(subscription: &RuntimeSubscription) -> Option<String> {
    if let Some(topic) = subscription
        .topic
        .as_ref()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
    {
        return Some(topic.to_string());
    }

    let symbol = subscription
        .params
        .as_ref()
        .and_then(|params| params.get("symbol"))
        .and_then(Value::as_str)
        .map(|value| value.to_lowercase());

    match subscription.channel.as_str() {
        "market.trade.tick" => Some(match symbol {
            Some(symbol) => format!("{symbol}@trade"),
            None => "btcusdt@trade".to_string(),
        }),
        "market.depth.delta" => {
            let speed = subscription
                .params
                .as_ref()
                .and_then(|params| params.get("speed"))
                .and_then(Value::as_str)
                .unwrap_or("100ms");

            Some(match symbol {
                Some(symbol) => format!("{symbol}@depth@{speed}"),
                None => format!("btcusdt@depth@{speed}"),
            })
        }
        _ => None,
    }
}

async fn run_subscription_worker(
    app: AppHandle,
    channel: String,
    topic: String,
    mut stop_rx: oneshot::Receiver<()>,
) {
    let mut reconnect_attempt: u32 = 0;

    loop {
        emit_connection_state(&app, "connecting");
        let stream_url = format!("wss://stream.binance.com:9443/ws/{topic}");

        match connect_async(&stream_url).await {
            Ok((mut ws_stream, _)) => {
                reconnect_attempt = 0;
                emit_connection_state(&app, "ready");

                loop {
                    if should_stop(&mut stop_rx) {
                        emit_connection_state(&app, "offline");
                        return;
                    }

                    match timeout(Duration::from_millis(350), ws_stream.next()).await {
                        Ok(Some(Ok(Message::Text(text)))) => {
                            if let Ok(payload) = serde_json::from_str::<Value>(&text) {
                                emit_runtime_event(&app, &channel, payload);
                            }
                        }
                        Ok(Some(Ok(Message::Binary(binary)))) => {
                            if let Ok(text) = String::from_utf8(binary.to_vec()) {
                                if let Ok(payload) = serde_json::from_str::<Value>(&text) {
                                    emit_runtime_event(&app, &channel, payload);
                                }
                            }
                        }
                        Ok(Some(Ok(Message::Close(_)))) => {
                            break;
                        }
                        Ok(Some(Ok(_))) => {}
                        Ok(Some(Err(error))) => {
                            eprintln!("ws message error ({channel}/{topic}): {error}");
                            break;
                        }
                        Ok(None) => {
                            break;
                        }
                        Err(_) => {}
                    }
                }
            }
            Err(error) => {
                eprintln!("ws connect error ({channel}/{topic}): {error}");
            }
        }

        emit_connection_state(&app, "reconnecting");

        let exp = 2_u64.saturating_pow(reconnect_attempt);
        let delay = (DEFAULT_RECONNECT_BASE_DELAY_MS.saturating_mul(exp))
            .min(DEFAULT_RECONNECT_MAX_DELAY_MS);
        reconnect_attempt = reconnect_attempt.saturating_add(1);

        let wait_until = Instant::now() + Duration::from_millis(delay);
        loop {
            if should_stop(&mut stop_rx) {
                emit_connection_state(&app, "offline");
                return;
            }

            if Instant::now() >= wait_until {
                break;
            }

            sleep(Duration::from_millis(200)).await;
        }
    }
}

fn should_stop(stop_rx: &mut oneshot::Receiver<()>) -> bool {
    match stop_rx.try_recv() {
        Ok(_) => true,
        Err(TryRecvError::Closed) => true,
        Err(TryRecvError::Empty) => false,
    }
}

fn resolve_secure_service(service: Option<String>) -> String {
    service
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_SECURE_SERVICE.to_string())
}

#[tauri::command]
fn ping_rust(name: Option<String>) -> String {
    let identity = name.unwrap_or_else(|| "trader".to_string());
    format!("pong from rust: {identity}")
}

#[tauri::command]
fn emit_runtime_state(app: AppHandle, state: String) -> Result<(), String> {
    emit_connection_state(&app, &state);
    Ok(())
}

#[tauri::command]
async fn runtime_subscribe(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    subscription: RuntimeSubscription,
) -> Result<(), String> {
    let topic = resolve_topic(&subscription).ok_or_else(|| {
        format!(
            "failed to resolve topic for channel '{}' (try passing subscription.topic)",
            subscription.channel
        )
    })?;

    let key = subscription_key(&subscription);
    let channel = subscription.channel.clone();
    let mut workers = state.workers.lock().await;

    if let Some(existing_worker) = workers.remove(&key) {
        let _ = existing_worker.stop_tx.send(());
    }

    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        run_subscription_worker(app_handle, channel, topic, stop_rx).await;
    });

    workers.insert(key, SubscriptionWorker { stop_tx });

    Ok(())
}

#[tauri::command]
async fn runtime_unsubscribe(
    state: State<'_, RuntimeState>,
    subscription: RuntimeSubscription,
) -> Result<(), String> {
    let key = subscription_key(&subscription);
    let mut workers = state.workers.lock().await;

    if let Some(existing_worker) = workers.remove(&key) {
        let _ = existing_worker.stop_tx.send(());
    }

    Ok(())
}

#[tauri::command]
async fn runtime_disconnect_all(state: State<'_, RuntimeState>) -> Result<(), String> {
    let mut workers = state.workers.lock().await;

    for (_, worker) in workers.drain() {
        let _ = worker.stop_tx.send(());
    }

    Ok(())
}

#[tauri::command]
fn save_secure_credential(
    service: Option<String>,
    account: String,
    secret: String,
) -> Result<(), String> {
    let service_name = resolve_secure_service(service);
    let entry = Entry::new(&service_name, &account).map_err(|error| error.to_string())?;
    entry.set_password(&secret).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_secure_credential(service: Option<String>, account: String) -> Result<Option<String>, String> {
    let service_name = resolve_secure_service(service);
    let entry = Entry::new(&service_name, &account).map_err(|error| error.to_string())?;

    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_secure_credential(service: Option<String>, account: String) -> Result<(), String> {
    let service_name = resolve_secure_service(service);
    let entry = Entry::new(&service_name, &account).map_err(|error| error.to_string())?;

    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .manage(RuntimeState::default())
        .invoke_handler(tauri::generate_handler![
            ping_rust,
            emit_runtime_state,
            runtime_subscribe,
            runtime_unsubscribe,
            runtime_disconnect_all,
            save_secure_credential,
            load_secure_credential,
            delete_secure_credential
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
