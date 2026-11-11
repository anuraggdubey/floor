import { notFound } from "next/navigation";
import { Lab } from "./Lab";

/** Effects lab: fire the dump splash, the shock and the payout on demand. Development only. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Lab />;
}
