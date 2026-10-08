# 🎙️ Voice Translate App

Aplicación de llamadas de voz 1 a 1 nativa y multiplataforma (iOS, Android y Web) con traducción automática en tiempo real y síntesis de voz hiperrealista utilizando **FastAPI**, **Whisper**, **Edge-TTS**, y **React Native Expo**.

---

## 🌐 Idiomas Soportados (7 Idiomas Internacionales)

1. **Inglés** (`en`) - Voice: `en-US-GuyNeural`
2. **Español** (`es`) - Voice: `es-ES-AlvaroNeural`
3. **Chino Mandarín** (`zh`) - Voice: `zh-CN-YunxiNeural`
4. **Francés** (`fr`) - Voice: `fr-FR-HenriNeural`
5. **Árabe** (`ar`) - Voice: `ar-SA-HamedNeural`
6. **Portugués** (`pt`) - Voice: `pt-BR-AntonioNeural`
7. **Japonés** (`ja`) - Voice: `ja-JP-KeitaNeural`

---

## 🛠️ Arquitectura y Stack Tecnológico

### **1. Backend (Python 3.12 + FastAPI)**
- **FastAPI + Uvicorn:** Manejo de salas y comunicaciones WebSocket de ultra baja latencia.
- **Reconocimiento de Voz (STT):** `faster-whisper` (modelo `tiny` / VAD filter de actividad de voz).
- **Traducción:** `deep-translator` (MyMemory con fallback a Google Translator).
- **Síntesis de Voz (TTS):** `edge-tts` (voces neuronales hiperrealistas).

### **2. Frontend (React Native + Expo + TypeScript)**
- **Framework:** React Native Expo (Blank TypeScript).
- **Grabación y Reproducción de Audio:** `expo-av`.
- **UI:** Modo oscuro moderno (`#0F172A`), selección de idiomas interactiva con banderas, subtítulos flotantes en tiempo real y controles de llamada (Mute micrófono, Mute altavoz TTS y finalizar llamada).

---

## 📁 Estructura del Proyecto

```text
voice-translate-app/
├── backend/
│   ├── requirements.txt      # Dependencias de Python
│   ├── main.py               # Servidor FastAPI, salas y WebSockets
│   ├── audio_processor.py    # Pipeline STT (Whisper), Traducción y TTS (Edge-TTS)
│   └── asgi.py               # Punto de entrada ASGI
└── frontend/
    ├── package.json          # Dependencias de React Native / Expo
    ├── tsconfig.json         # Configuración de TypeScript
    ├── App.tsx               # Control de navegación y estado global
    ├── HomeScreen.tsx        # Selección de idiomas y salas
    ├── CallScreen.tsx        # Grabación continua, streaming WebSocket y subtítulos
    └── types.ts              # Interfaces y tipos de TypeScript
```

---

## 🚀 Pasos de Instalación y Ejecución

### **1. Requisitos Previos**
- Python 3.10+ (recomendado 3.12)
- Node.js 18+ y `npm`
- `ffmpeg` instalado en el sistema operativo.

---

### **2. Configuración y Ejecución del Backend (FastAPI)**

1. Entra en el directorio del backend:
   ```bash
   cd voice-translate-app/backend
   ```

2. Crea y activa un entorno virtual de Python:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # En Windows: venv\Scripts\activate
   ```

3. Instala las dependencias necesarias:
   ```bash
   pip install -r requirements.txt
   ```

4. Inicia el servidor FastAPI con Uvicorn:
   ```bash
   python3 asgi.py
   # o alternativamente:
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   El servidor estará disponible en `http://localhost:8000`.

---

### **3. Configuración y Ejecución del Frontend (React Native Expo)**

1. En una nueva terminal, entra en el directorio del frontend:
   ```bash
   cd voice-translate-app/frontend
   ```

2. Instala las dependencias de Node.js:
   ```bash
   npm install
   ```

3. Ejecuta la aplicación en la plataforma deseada:

   - **Para Web:**
     ```bash
     npm run web
     ```

   - **Para Android:**
     ```bash
     npm run android
     ```

   - **Para iOS:**
     ```bash
     npm run ios
     ```

   - **Servidor de desarrollo Expo (Escaneo de código QR en Expo Go):**
     ```bash
     npm start
     ```

---

## 📱 Guía de Uso de la Aplicación

1. **Abre la app** en dos dispositivos/navegadores o emuladores.
2. **Selecciona tus idiomas:**
   - **Idioma de Habla (Nativo):** El idioma en el que hablarás.
   - **Idioma de Escucha (Destino):** El idioma en el que deseas escuchar y leer al interlocutor.
3. **Crea o Únete a una Sala:**
   - Haz clic en **"Crear Nueva Sala"** para generar un código único de 6 caracteres (ej. `ABC-123`).
   - O introduce el código en **"Unirse con Código"** desde el segundo dispositivo.
4. **En la Llamada en Tiempo Real:**
   - Habla libremente por el micrófono.
   - Los fragmentos de audio serán procesados, traducidos y sintetizados automáticamente.
   - Escucharás la voz traducida hiperrealista y verás los subtítulos flotantes con el texto traducido y original.
   - Utiliza los botones de la parte inferior para **Silenciar Micrófono**, **Silenciar Altavoz TTS** o **Finalizar Llamada**.
