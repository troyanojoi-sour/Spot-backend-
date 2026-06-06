import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const credentialsPath = process.env.FIREBASE_CREDENTIALS_PATH || "./config/firebase-service-account.json";

// Inicializa Firebase Admin SDK si el archivo de cuenta de servicio existe
if (fs.existsSync(credentialsPath)) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(credentialsPath),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
    console.log("Firebase Admin SDK inicializado correctamente.");
  } catch (e) {
    console.error("Error inicializando Firebase Admin SDK:", e);
  }
} else {
  console.warn(
    `[ADVERTENCIA] Archivo de credenciales de Firebase no encontrado en '${credentialsPath}'. ` +
    "Se ejecutarán las llamadas FCM en modo simulación (mock)."
  );
}

/**
 * Envía una notificación push FCM a un dispositivo de usuario.
 * @param token FCM Token del dispositivo destino.
 * @param title Título de la notificación.
 * @param body Descripción del mensaje.
 * @param data Parámetros adicionales (ej. redirigir a una ruta específica).
 */
export const sendFcmNotification = async (
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  const message = {
    notification: { title, body },
    data: data || {},
    token
  };

  try {
    // Si la app Firebase está inicializada, envía la alerta real
    if (admin.apps.length > 0) {
      const response = await admin.messaging().send(message);
      console.log("Mensaje enviado exitosamente vía FCM:", response);
      return response;
    } else {
      console.log(
        "[MOCK FCM] Notificación push simulada enviada con éxito.\n" +
        `Destinatario Token: ${token}\nTítulo: ${title}\nCuerpo: ${body}\nData:`, data
      );
      return "mock-fcm-success-id";
    }
  } catch (error) {
    console.error("Error enviando mensaje FCM:", error);
    throw error;
  }
};

export default admin;
