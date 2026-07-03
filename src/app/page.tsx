import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";

export default async function HomePage() {
  const appUser = await getCurrentAppUser();
  redirect(appUser ? "/characters" : "/login");
}
