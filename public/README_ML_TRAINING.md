# LSEC — Plan de Entrenamiento ML con Múltiples Tomas por Gesto

## Objetivo

Entrenar un modelo de aprendizaje automático (ML) que reconozca gestos LSEC en tiempo real a partir de landmarks de mano (21 puntos × 3 coordenadas = vector 63D) y, opcionalmente, landmarks faciales (subconjunto ~120 puntos de FaceMesh). El modelo debe ser invariante a la persona firmante, velocidad de ejecución y rotación/traslación de la mano.

## Dataset

### Fuentes

- **Módulos 03–10** (`assets/LSEC2/03_SUSTANTIVOS/` … `10_AULA_INCLUSIVA/`): Una grabación por gesto, archivos `.MTS`.
- **`assets/LSEC2/VIDEOS/lsec/VIDEOS VARIOS LSEC/`**: Múltiples tomas y variaciones de los mismos gestos, tanto `.MP4` como `.MTS`. Algunos gestos aparecen repetidos con diferentes firmantes, ángulos, iluminación o velocidad.

### Estructura de datos de entrenamiento

Cada muestra de entrenamiento es una **secuencia temporal** de landmarks normalizados:

```
muestra = {
  "word": "ABUELO",
  "module": "03_SUSTANTIVOS",
  "category": "personas_familia",
  "fps": 29.97,
  "frames": [
    {
      "t": 0.0,           # tiempo relativo (0–1)
      "hand": {           # mano primaria (la que más se mueve)
        "landmarks_norm": [[x,y,z]×21],
        "pairwise_distances": [210 floats],
        "palm_size": 0.05
      },
      "face": {           # opcional, si se detectó
        "landmarks_norm": [[x,y,z]×N],
        "metrics": { "mouth_open": 0.12, ... }
      }
    },
    ...
  ]
}
```

### Preprocesamiento

1. **Normalización por gesto**: Remuestrear todas las secuencias a `N` frames fijos (ej. 16) mediante interpolación lineal.
2. **Aumentación**:
   - Ruido gaussiano en landmarks (σ = 0.005)
   - Escalamiento aleatorio (0.9–1.1)
   - Rotación 2D en plano imagen (±15°)
   - Time-warping elástico (perturbación suave del eje temporal)
3. **División**: 80% entrenamiento, 10% validación, 10% test. Asegurar que todas las tomas del mismo gesto caigan en el mismo split (no filtrar entre splits).

## Arquitectura Propuesta

### Opción A: LSTM + Atención (recomendada para pruebas iniciales)

```
Input: [batch, N_frames, 63]   (21 landmarks × 3 coordenadas)
  → LSTM(128, return_sequences=True)
  → Dropout(0.3)
  → LSTM(64)
  → Dropout(0.3)
  → Dense(32, ReLU)
  → Dense(num_clases, Softmax)
```

- Pérdida: `CategoricalCrossentropy`
- Optimizador: Adam (lr=1e-3 → 1e-4 con cosine decay)
- Métrica: accuracy top-1 + top-3

### Opción B: Transformer Temporal (para producción)

```
Input: [batch, N_frames, 63]
  → PositionalEncoding
  → TransformerEncoder(num_layers=4, d_model=128, num_heads=4)
  → GlobalAveragePooling1D
  → Dense(64, ReLU)
  → Dense(num_clases, Softmax)
```

- Ventaja: mejor manejo de dependencias lejanas en la secuencia.
- Desventaja: requiere más datos.

### Opción C: Distancia Euclideana + KNN (baseline simple)

Usar los vectores `pairwise_distances` (210D) directamente:

- Por cada frame del gesto vivo, buscar el frame más cercano en el diccionario por distancia coseno.
- Votación ponderada sobre ventana deslizante (equivalente a lo que ya hace `section-senias.js`).
- Este es el baseline actual; el ML debe superarlo.

## Features de Entrada

| Feature | Dimensión | Descripción |
|---------|-----------|-------------|
| `landmarks_norm` | 63 | (x,y,z) normalizados por muñeca y escala de palma |
| `pairwise_distances` | 210 | Distancias entre todos los pares de landmarks |
| `finger_state` | 5 | Booleano: pulgar/índice/medio/anular/meñique extendido |
| `angles` | 10 | Coseno del ángulo de flexión de cada dedo (2 por dedo) |
| `palm_size` | 1 | Escala absoluta (útil para distinguir manos cercanas/lejanas) |
| Face `metrics` | ~6 | mouth_open, eyebrow_raise, eye_open por lado |

### Pipelines de features

1. **Solo mano**: 63-D (landmarks_norm) → más robusto, menos datos necesarios
2. **Mano + ángulos**: 63 + 10 = 73-D
3. **Mano + pairwise**: 63 + 210 = 273-D (redundante pero útil como embedding)
4. **Full**: 63 + 10 + 5 + 1 + 6 = 85-D

## Implementación

### Stack tecnológico

| Componente | Opción |
|------------|--------|
| Framework | TensorFlow 2.x / PyTorch |
| Extracción landmarks | MediaPipe Hands + FaceMesh (Python) |
| Dataset pipeline | `tf.data.Dataset` o `torch.utils.data` |
| Entrenamiento | GPU (NVIDIA CUDA) |
| Export | TF-Lite (para web) u ONNX |
| Inferencia web | TensorFlow.js o ONNX Runtime Web |
| Almacenamiento | `lib/lsec_model/` (modelo exportado + label mapping) |

### Flujo de entrenamiento

```bash
# 1. Generar diccionarios base (una toma por gesto)
python public/generar_diccionario.py
python public/generar_diccionario_gestos.py

# 2. Script de extracción para ML (procesa VIDEOS/ y módulos)
python public/extract_ml_dataset.py \
    --source assets/LSEC2 \
    --out lib/lsec_dataset/ \
    --samples 16 \
    --include-videos

# 3. Entrenamiento
python public/train_gesture_model.py \
    --dataset lib/lsec_dataset/ \
    --out lib/lsec_model/ \
    --arch transformer \
    --epochs 100

# 4. Exportar para web
python public/export_tfjs.py \
    --model lib/lsec_model/ \
    --out lib/lsec_model/tfjs/
```

### Scripts futuros a crear

| Script | Propósito |
|--------|-----------|
| `public/extract_ml_dataset.py` | Procesa todas las tomas (módulos + VIDEOS) y genera dataset HDF5/TFRecord con secuencias remuestreadas |
| `public/train_gesture_model.py` | Entrena modelo LSTM/Transformer con aumentación y validación |
| `public/evaluate_gesture_model.py` | Evalúa en test set: accuracy, matriz de confusión, F1 por clase |
| `public/export_tfjs.py` | Convierte modelo a formato TensorFlow.js para inferencia en navegador |

## Integración Web (futuro)

En `js/section-senias.js`, reemplazar `matchGestureFrame()` (distancia euclideana) por:

```javascript
// Cargar modelo TF.js
const model = await tf.loadGraphModel('lib/lsec_model/tfjs/model.json');

function matchGestureML(landmarks_norm) {
    const tensor = tf.tensor([landmarks_norm.flat()]);
    const pred = model.predict(tensor);
    const idx = pred.argMax(1).dataSync()[0];
    return labelMap[idx];
}
```

Para reconocimiento de secuencias completas, mantener un buffer de los últimos N frames y ejecutar predicción por ventana deslizante cada K frames.

## Métricas de Éxito

- Accuracy top-1 en test set: > 85%
- Accuracy top-3: > 95%
- Inferencia en navegador: < 50ms por frame
- Tamaño del modelo exportado: < 2 MB (TF-Lite) o < 5 MB (TF.js)

## Próximos Pasos

1. Ejecutar scripts de generación de diccionarios base (módulos 03–10)
2. Inspeccionar visualmente los reportes HTML para validar calidad de landmarks
3. Crear `extract_ml_dataset.py` que procese `VIDEOS/` y genere el dataset aumentado
4. Entrenar modelo baseline (LSTM) y comparar contra KNN dictionary-based
5. Iterar: ajustar hiperparámetros, probar Transformer, agregar face features
6. Exportar a TF.js e integrar en la web
