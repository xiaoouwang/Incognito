# GLiNER2-PII ONNX sidecar (Basic mode)

Local inference for [`okasi/gliner2-privacy-filter-pii-multi-onnx`](https://huggingface.co/okasi/gliner2-privacy-filter-pii-multi-onnx) — quantized ONNX of Fastino’s multilingual PII model.

Uses `model_q8.onnx` (~510 MB) via **onnxruntime** (no PyTorch). Label schema is fixed at export: `name`, `address`, `email`, `phone_num`, `id_num`, `url`, `username`.

## Setup

```bash
cd web_interface
python3 -m venv .venv-gliner2
.venv-gliner2/bin/pip install -r gliner2_pii_server/requirements.txt
```

## Run

```bash
# terminal 1 — sidecar (first run downloads the Hub snapshot)
npm run gliner2-pii-server

# terminal 2
npm run dev
```

Open **Basic** mode and run detection. Vite proxies `/gliner2-pii-api` → `http://127.0.0.1:8765`.

Optional env:

| Variable | Default | Meaning |
| --- | --- | --- |
| `GLINER2_PII_LOCAL_DIR` | — | Path to an already-downloaded model folder |
| `GLINER2_PII_ONNX_FILE` | `model_q8.onnx` | `model_q4.onnx` for a smaller package |
| `GLINER2_PII_PORT` | `8765` | Bind port |

Person graph in Basic uses **proximity** after PII detection (relation model comes later).
