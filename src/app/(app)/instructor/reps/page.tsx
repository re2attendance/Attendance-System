import type { Metadata } from "next";

import { RepManager } from "@/features/reps/components/rep-manager";
import { listRepSections } from "@/features/reps/queries";
import { requireInstructor } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Course reps · Attendance" };

export default async function RepsPage() {
  const user = await requireInstructor();
  const sections = await listRepSections(user);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Course reps</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          A rep is a student you trust to confirm who is in the room. Appointing
          one is a row with a period, not a permanent title — you can hand it
          over, add a co-rep, or revoke it, and the record of who held it when
          survives all three.
        </p>
      </div>

      <RepManager sections={sections} />
    </div>
  );
}
