/**
 * Firestore Admin SDK（サーバーコンポーネント用）
 * FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY が揃う場合は cert を必ず使用し、
 * それ以外のみ applicationDefault() へフォールバックする。
 */
import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

function init() {
  if (getApps().length) return getApp();

  const useCert = Boolean(clientEmail && privateKey);
  const credential = useCert
    ? cert({
        projectId,
        clientEmail,
        privateKey,
      })
    : applicationDefault();

  console.log("[firestore] init", {
    projectIdSet: Boolean(projectId),
    clientEmailSet: Boolean(clientEmail),
    privateKeySet: Boolean(privateKey),
    authMode: useCert ? "cert" : "application_default",
  });

  return initializeApp({
    projectId,
    credential,
  });
}

export const firebaseApp = init();
export const db = getFirestore(firebaseApp);
