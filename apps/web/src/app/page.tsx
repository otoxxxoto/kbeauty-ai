import { redirect } from "next/navigation";

/**
 * ルート / はメディア入口 /oliveyoung へリダイレクト
 */
export default function Home() {
  redirect("/oliveyoung");
}
