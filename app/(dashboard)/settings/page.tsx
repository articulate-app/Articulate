import { redirect } from "next/navigation";

// Settings now lives inside the unified workspace shell (normal sidebar + header)
// and opens in the center/details pane via the `settings=open` param.
export default function SettingsPage() {
  redirect("/?settings=open");
}
