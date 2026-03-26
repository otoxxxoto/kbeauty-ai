/**
 * Firestore Admin SDK（サーバーコンポーネント用）
 * 必ず projectId=kbeauty-ai を参照するため GCP_PROJECT_ID を明示する。
 * GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_JSON は kbeauty-ai のサービスアカウントを指すこと。
 */
import admin from "firebase-admin";

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "kbeauty-ai";

function init() {
  if (admin.apps.length) return admin.app();

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const options: admin.AppOptions = {
    projectId: GCP_PROJECT_ID,
  };

  if (json) {
    options.credential = admin.credential.cert(JSON.parse(json) as admin.ServiceAccount);
  } else {
    options.credential = admin.credential.applicationDefault();
  }

  const app = admin.initializeApp(options);
  const appProjectId = (app.options as { projectId?: string })?.projectId ?? "(not set)";
  console.log("[firestore] init", {
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    appProjectId,
  });
  return app;
}

export const firebaseApp = init();
export const db = admin.firestore(firebaseApp);
