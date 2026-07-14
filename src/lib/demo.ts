const key = "eclipse-demo-role";

export type DemoRole = "teacher" | "student";

export const getDemoRole = (): DemoRole | null => {
  if (!import.meta.env.DEV) return null;
  const value = localStorage.getItem(key);
  return value === "teacher" || value === "student" ? value : null;
};

export const setDemoRole = (role: DemoRole) => {
  if (import.meta.env.DEV) localStorage.setItem(key, role);
};

export const clearDemoRole = () => localStorage.removeItem(key);
