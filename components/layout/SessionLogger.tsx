"use client";

import * as React from "react";

export default function SessionLogger({ data }: { data: any }) {
  React.useEffect(() => {
    // Temporary debug: avoids printing session JSON in the UI.
    // eslint-disable-next-line no-console
    console.log("[Session]", data);
  }, [data]);

  return null;
}
