import type { Role } from "./types";

export type NavItem = {
  href: string;
  label: string;
  roles: Role[];
  ready?: boolean; // built in this milestone
  blurb: string;
};

const ADMIN: Role[] = ["super_admin", "owner", "manager"];
const OWNER: Role[] = ["super_admin", "owner"];
const ALL: Role[] = ["super_admin", "owner", "manager", "gate"];

// Order and names follow the sidebar in the mockups
export const NAV: NavItem[] = [
  { href: "/", label: "Today", roles: ADMIN, ready: true, blurb: "Collection, tickets sold, seats filled and alerts" },
  { href: "/shows", label: "Shows", roles: ADMIN, ready: true, blurb: "Movies, a week of show timings, prices and booking open time" },
  { href: "/bookings", label: "Bookings", roles: ADMIN, ready: true, blurb: "Search by booking ID, name or mobile; resend or refund" },
  { href: "/block-rows", label: "Block rows", roles: ADMIN, ready: true, blurb: "Block rows or seats for one show or all upcoming shows" },
  { href: "/scan", label: "Scan tickets", roles: ALL, blurb: "Gate scanning is in the Hari Shankar Android app: Profile, then Gate scanner. Log in with this same mobile number and PIN" },
  { href: "/promotions", label: "Promotions", roles: ADMIN, ready: true, blurb: "Offers and promo codes customers use at checkout" },
  { href: "/messages", label: "Messages", roles: OWNER, blurb: "Promotional WhatsApp messages to opted-in customers" },
  { href: "/insights", label: "Insights", roles: OWNER, ready: true, blurb: "Who books, when they book and what fills the hall" },
  { href: "/reports", label: "Reports", roles: OWNER, ready: true, blurb: "Daily collection, occupancy, refunds and GST" },
  { href: "/staff", label: "Staff", roles: OWNER, ready: true, blurb: "Add staff, set roles, reset PINs, disable logins" },
];

export function navFor(role: Role) {
  return NAV.filter((n) => n.roles.includes(role));
}

/** Where a user lands after login. Gate staff go straight to scanning. */
export function homeFor(role: Role) {
  return role === "gate" ? "/scan" : "/";
}
