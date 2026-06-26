import { Suspense } from "react";

import { BulkPackClient } from "./bulk-pack-client";

export default function BulkPackPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#5C564D]">Loading print pack…</p>}>
      <BulkPackClient />
    </Suspense>
  );
}
