# 🪞 AR Mirror Web - Experiencias de Realidad Aumentada

Una aplicación web interactiva que utiliza Inteligencia Artificial y Visión Artificial (MediaPipe) para crear experiencias de Realidad Aumentada directamente en el navegador.

## 🚀 Funcionalidades Actuales

### 1. 🐦 Flappy Nose
Controla al famoso pájaro usando tu **nariz**. 
- **Tecnología**: Face Landmarker de MediaPipe.
- **Mecánica**: El pájaro sigue el eje vertical y horizontal de tu nariz en tiempo real[cite: 29]. Las tuberías se mueven de forma invertida para compensar el efecto espejo del video[cite: 29].

### 2. ✋ Traductor de Señas
Detección avanzada de manos que interpreta gestos y letras del alfabeto de señas.
- **Tecnología**: Hand Landmarker de MediaPipe (soporta hasta 2 manos).
- **Diccionario**: Detecta números (1-5), letras (A, B, L, I), el símbolo de "Rock" y el gesto de "Bien" (pulgar arriba)[cite: 30].
- **Lateralidad**: Identifica si la mano detectada es la izquierda o la derecha[cite: 30].

### 3. 🦁 Animales AR (En desarrollo)
Detección de pose corporal para interactuar con elementos virtuales sobre los hombros o extremidades.
- **Tecnología**: Pose Landmarker de MediaPipe.

## 🛠️ Tecnologías Utilizadas

- **Frontend**: HTML5, CSS3 (Variables, Flexbox, Grid)[cite: 24, 25].
- **Lógica**: JavaScript (ES6 Modules)[cite: 27].
- **IA/ML**: [MediaPipe Tasks Vision](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3)[cite: 30].
- **Procesamiento**: WebGL para aceleración por GPU[cite: 30].

