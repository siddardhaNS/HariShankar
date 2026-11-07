export type Role = "super_admin" | "owner" | "manager" | "gate";

export type Staff = {
  id: string;
  name: string;
  mobile: string;
  role: Role;
  is_active: boolean;
  must_change_pin: boolean;
  last_login_at: string | null;
  theatre_id: string | null;
};

export type Me = {
  user: Staff;
  theatre: { id: string; name: string; city: string } | null;
};

export type LoginResponse = Me & { access_token: string; expires_in: number };

export type FormState = { error?: string; ok?: string } | undefined;

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  owner: "Owner",
  manager: "Manager",
  gate: "Gate staff",
};

export const ROLE_HINT: Record<Exclude<Role, "super_admin">, string> = {
  owner: "Everything",
  manager: "Movies, shows, prices, blocking",
  gate: "Scanning only",
};
