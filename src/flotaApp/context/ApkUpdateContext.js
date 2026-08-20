import { createContext, useContext } from "react";

export const ApkUpdateContext = createContext({
  installedVersion: "",
  forceRefresh: async () => null,
});

export function useApkUpdateActions() {
  return useContext(ApkUpdateContext);
}
