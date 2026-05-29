# API Test Guide

Base URL:

```txt
http://localhost:3000
```

Authenticated requests:

```txt
Authorization: Bearer <token>
Content-Type: application/json
```

Guest requests:

```txt
x-guest-id: <device-id>
Content-Type: application/json
```

## Auth

### Register

```http
POST /auth/register
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "123456",
  "name": "Demo User"
}
```

### Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

### Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

```http
GET /users/me
Authorization: Bearer <token>
```

### Update Profile

```http
PATCH /users/me
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "name": "Updated Name"
}
```

## Folders

### Create Folder

```http
POST /folders
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "name": "English Practice",
  "description": "Daily pronunciation practice",
  "color": "#3B82F6",
  "icon": "folder"
}
```

Guest variant:

```http
POST /folders
x-guest-id: device-123
Content-Type: application/json
```

### List Folders

```http
GET /folders
Authorization: Bearer <token>
```

### Update Folder

```http
PATCH /folders/<folderId>
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "name": "Updated Folder",
  "color": "#22C55E"
}
```

### Delete Folder

```http
DELETE /folders/<folderId>
Authorization: Bearer <token>
```

## Text Items

### Create Text Item

```http
POST /text-items
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "folderId": "<folderId>",
  "originalText": "Hello, how are you?",
  "translatedText": "Xin chao, ban khoe khong?",
  "sourceLang": "en",
  "destLang": "vi",
  "voiceType": "FEMALE",
  "voiceProvider": "azure",
  "voiceName": "en-US-JennyNeural"
}
```

### List Text Items

```http
GET /text-items?folderId=<folderId>
Authorization: Bearer <token>
```

### Update Text Item

```http
PATCH /text-items/<textItemId>
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "originalText": "Hello, nice to meet you.",
  "voiceType": "NEUTRAL"
}
```

## Attempts

### Create Attempt

```http
POST /attempts
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "textItemId": "<textItemId>",
  "languageCode": "en",
  "overallScore": 86.5,
  "accuracyScore": 90,
  "fluencyScore": 84,
  "completenessScore": 88,
  "prosodyScore": 82,
  "status": "COMPLETED",
  "audioUrl": "https://example.com/audio.wav",
  "recognizedText": "Hello, how are you?",
  "details": {
    "words": []
  }
}
```

### Attempt History

```http
GET /attempts?textItemId=<textItemId>&status=COMPLETED&languageCode=en
Authorization: Bearer <token>
```

```http
GET /attempts/<attemptId>
Authorization: Bearer <token>
```

## AI Pronunciation Assessment

Set these environment variables before using Azure pronunciation assessment:

```txt
AZURE_SPEECH_KEY=<your-azure-speech-key>
AZURE_SPEECH_REGION=<your-azure-region>
```

The current backend accepts WAV audio for assessment.

```http
POST /speech/analyze
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form fields:

```txt
textItemId=<textItemId>
languageCode=en
referenceText=Hello, how are you?
audio=@recording.wav
```

`referenceText` is optional. If omitted, the backend uses the related text item's `originalText`.

Example curl:

```bash
curl -X POST http://localhost:3000/speech/analyze \
  -H "Authorization: Bearer <token>" \
  -F "textItemId=<textItemId>" \
  -F "languageCode=en" \
  -F "referenceText=Hello, how are you?" \
  -F "audio=@recording.wav"
```

## Chatbot Conversation

Set this environment variable before using chatbot APIs:

```txt
OPENAI_API_KEY=<your-openai-api-key>
```

Optional model overrides:

```txt
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

The chatbot supports:

- Text chat: user sends text, bot replies with text and MP3 voice.
- Voice chat: user uploads audio, backend transcribes it to text, bot replies with text and MP3 voice.

The response includes the full `conversation`, latest `assistant.text`, and `assistant.audio.audioBase64`.

### Text Chat

```http
POST /chat/text
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "conversationId": "<optionalConversationId>",
  "message": "Can we practice a short English conversation?",
  "languageCode": "en",
  "voice": "alloy"
}
```

Guest variant:

```http
POST /chat/text
x-guest-id: device-123
Content-Type: application/json
```

### Voice Chat

```http
POST /chat/voice
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form fields:

```txt
conversationId=<optionalConversationId>
languageCode=en
voice=alloy
audio=@message.wav
```

Supported upload formats: `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`.

Example curl:

```bash
curl -X POST http://localhost:3000/chat/voice \
  -H "Authorization: Bearer <token>" \
  -F "languageCode=en" \
  -F "voice=alloy" \
  -F "audio=@message.wav"
```

### Conversation History

```http
GET /chat/conversations
Authorization: Bearer <token>
```

```http
GET /chat/conversations/<conversationId>
Authorization: Bearer <token>
```

## Languages

```http
GET /languages
```

## User Settings

### Get Settings

```http
GET /user-settings/me
Authorization: Bearer <token>
```

### Update Settings

```http
PATCH /user-settings/me
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "theme": "system",
  "language": "vi",
  "dailyGoal": 20,
  "autoPlaySample": true,
  "reminderEnabled": true,
  "reminderTime": "20:00",
  "allowDataCollection": false,
  "nativeLanguage": "vi",
  "ageRange": "AGE_18_24",
  "gender": "PREFER_NOT_TO_SAY"
}
```
