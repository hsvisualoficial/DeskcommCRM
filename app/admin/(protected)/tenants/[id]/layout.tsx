import type { ReactNode } from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CaretLeft } from "@/lib/ui/icons";

// ---------------------------------------------------------------------------
// Status badge helpers (same palette as TenantsTable)
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<
  string,
  "success" | "info" | "warning" | "error" | "neutral"
> = {
  active: "success",
  onboarding: "info",
  suspended: "warning",
  redacted: "error",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  onboarding: "Onboarding",
  suspended: "Suspenso",
  redacted: "Redigido",
};

// ---------------------------------------------------------------------------
// Sub-nav tabs definition
// ---------------------------------------------------------------------------

interface TabItem {
  label: string;
  href: string;
  disabled: boolean;
}

const TABS: TabItem[] = [
  { label: "Visão Geral", href: "", disabled: false },
  { label: "Saúde", href: "/health", disabled: true },
  { label: "Equipe", href: "/team", disabled: true },
  { label: "Uso", href: "/usage", disabled: true },
];

// ---------------------------------------------------------------------------
// Layout (Server Component — requirePlatformAdmin already handled by outer
// (protected) layout, but we call it here for the org load context)
// ---------------------------------------------------------------------------

interface TenantLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default async function TenantDetailLayout({
  children,
  params,
}: TenantLayoutProps) {
  // Auth check — outer (protected)/layout.tsx already guards, but we need
  // org data server-side for the header. requirePlatformAdmin is cheap (cached).
  await requirePlatformAdmin();

  const { id } = await params;
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, display_name, status")
    .eq("id", id)
    .single();

  const basePath = `/admin/tenants/${id}`;

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/admin/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <CaretLeft size={14} aria-hidden />
        Tenants
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {org?.display_name ?? id}
          </h1>
          {org?.slug && (
            <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
              {org.slug}
            </code>
          )}
          {org?.status && (
            <Badge variant={STATUS_VARIANTS[org.status] ?? "neutral"}>
              {STATUS_LABELS[org.status] ?? org.status}
            </Badge>
          )}
        </div>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-0 border-b">
        {TABS.map((tab) => {
          const href = basePath + tab.href;
          const isOverview = tab.href === "";
          return (
            <Link
              key={tab.label}
              href={tab.disabled ? "#" : href}
              aria-disabled={tab.disabled}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab.disabled
                  ? "cursor-not-allowed text-muted-foreground/40 border-transparent"
                  : isOverview
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {tab.label}
              {tab.disabled && (
                <span className="ml-1.5 text-[10px] font-normal opacity-60">
                  em breve
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <Separator className="hidden" />

      {children}
    </div>
  );
}
