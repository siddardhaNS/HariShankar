import type { Role } from "./types";

export type NavItem = {
  href: string;
  label: string;
  roles: Role[];
  blurb: string;
};

const ADMIN: Role[] = ["super_admin", "owner", "manager"];
const OWNER: Role[] = ["super_admin", "owner"];

// Order and names follow the sidebar in the mockups
export const NAV: NavItem[] = [
  { href: "/", label: "Today", roles: ADMIN, blurb: "Collection, tickets sold, seats filled and alerts" },
  { href: "/shows", label: "Shows", roles: ADMIN, blurb: "Movies, a week of show timings, prices and booking open time" },
  { href: "/bookings", label: "Bookings", roles: ADMIN, blurb: "Search by booking ID, name or mobile; resend or refund" },
  { href: "/refunds", label: "Refunds", roles: ADMIN, blurb: "Money to send back, and every refund with its reason" },
  { href: "/block-rows", label: "Block rows", roles: ADMIN, blurb: "Block rows or seats for one show or all upcoming shows" },
  { href: "/promotions", label: "Promotions", roles: ADMIN, blurb: "Offers and promo codes customers use at checkout" },
  { href: "/messages", label: "Messages", roles: OWNER, blurb: "Promotional WhatsApp messages to opted-in customers" },
  { href: "/insights", label: "Insights", roles: OWNER, blurb: "Who books, when they book and what fills the hall" },
  { href: "/reports", label: "Reports", roles: OWNER, blurb: "Daily collection, occupancy, refunds and GST" },
  { href: "/staff", label: "Staff", roles: OWNER, blurb: "Add staff, set roles, reset PINs, disable logins" },
  { href: "/settings", label: "Settings", roles: ADMIN, blurb: "Close the app for maintenance and set the message customers see" },
];

export function navFor(role: Role) {
  return NAV.filter((n) => n.roles.includes(role));
}

/** Gate staff scan tickets in the Android app; the admin web isn't for them. */
export const GATE_ON_WEB =
  "Gate staff scan tickets in the Hari Shankar app, not on this website. Open the app, then Profile, then Gate scanner, and log in with this same mobile number and PIN.";
