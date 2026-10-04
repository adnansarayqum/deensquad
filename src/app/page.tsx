import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

// Parents land on club news; staff who aren't parents land on the admin.
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  redirect(user.guardian ? "/news" : user.staff ? "/admin" : "/sign-in/not-linked");
}
