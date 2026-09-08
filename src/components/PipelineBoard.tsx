"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import Link from "next/link";
import { STAGES, OPEN_STAGES, formatCurrency, urgencyLevel, urgencyScore, URGENCY_COLORS } from "@/lib/domain";
import type { Deal } from "@/lib/data";

const BOARD_STAGES = [...OPEN_STAGES, "closed_won", "closed_lost"] as const;

export default function PipelineBoard({ deals: initialDeals }: { deals: Deal[] }) {
  const [deals, setDeals] = useState(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const s of BOARD_STAGES) map.set(s, []);
    for (const d of deals) map.get(d.stage)?.push(d);
    return map;
  }, [deals]);

  async function moveDeal(dealId: string, newStage: string) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    router.refresh();
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const dealId = String(e.active.id);
    const newStage = e.over?.id ? String(e.over.id) : null;
    if (newStage && BOARD_STAGES.includes(newStage as any)) {
      const current = deals.find((d) => d.id === dealId);
      if (current && current.stage !== newStage) moveDeal(dealId, newStage);
    }
  }

  const activeDeal = deals.find((d) => d.id === activeId);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
        {BOARD_STAGES.map((stageId) => {
          const stageDeals = byStage.get(stageId) || [];
          const total = stageDeals.reduce((s, d) => s + d.value, 0);
          const cfg = STAGES.find((s) => s.id === stageId)!;
          return (
            <Column key={stageId} stageId={stageId} label={cfg.label} color={cfg.color} count={stageDeals.length} total={total}>
              {stageDeals.map((deal) => (
                <Card key={deal.id} deal={deal} onMove={moveDeal} />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay>{activeDeal ? <CardVisual deal={activeDeal} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  stageId,
  label,
  color,
  count,
  total,
  children,
}: {
  stageId: string;
  label: string;
  color: string;
  count: number;
  total: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      className="w-[280px] shrink-0 rounded-2xl p-3 flex flex-col"
      style={{
        background: isOver ? "rgba(212,168,67,0.08)" : "var(--panel)",
        border: `1px solid ${isOver ? "rgba(212,168,67,0.5)" : "var(--border)"}`,
        minHeight: 200,
      }}
    >
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            {label}
          </span>
          <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
            {count}
          </span>
        </div>
      </div>
      <div className="text-xs font-mono px-1 mb-3" style={{ color: "var(--ink-dim)" }}>
        {formatCurrency(total)}
      </div>
      <div className="space-y-2 flex-1">{children}</div>
    </div>
  );
}

function Card({ deal, onMove }: { deal: Deal; onMove: (id: string, stage: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : "auto" }
    : undefined;

  const idx = OPEN_STAGES.indexOf(deal.stage as any);
  const prevStage = idx > 0 ? OPEN_STAGES[idx - 1] : null;
  const nextStage = idx >= 0 && idx < OPEN_STAGES.length - 1 ? OPEN_STAGES[idx + 1] : idx === OPEN_STAGES.length - 1 ? "closed_won" : null;

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <div className="rounded-xl p-3 group" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <div className="flex items-start gap-2">
          <button {...attributes} {...listeners} className="mt-0.5 cursor-grab active:cursor-grabbing" aria-label="Drag">
            <GripVertical size={14} color="var(--ink-dim)" />
          </button>
          <Link href={`/app/contacts/${deal.contactId}`} className="min-w-0 flex-1">
            <div className="text-sm truncate" style={{ color: "var(--ink)" }}>
              {deal.title}
            </div>
            <div className="text-xs truncate" style={{ color: "var(--ink-dim)" }}>
              {deal.contactName}
            </div>
          </Link>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-mono" style={{ color: "var(--gold)" }}>
            {formatCurrency(deal.value)}
          </span>
          <UrgencyBadge deal={deal} />
        </div>
        {(prevStage || nextStage) && (
          <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition">
            <button
              disabled={!prevStage}
              onClick={() => prevStage && onMove(deal.id, prevStage)}
              className="p-1 rounded disabled:opacity-20"
              style={{ background: "var(--panel)" }}
              aria-label="Previous stage"
            >
              <ChevronLeft size={13} color="var(--ink-dim)" />
            </button>
            <button
              disabled={!nextStage}
              onClick={() => nextStage && onMove(deal.id, nextStage)}
              className="p-1 rounded disabled:opacity-20"
              style={{ background: "var(--panel)" }}
              aria-label="Next stage"
            >
              <ChevronRight size={13} color="var(--ink-dim)" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CardVisual({ deal, dragging }: { deal: Deal; dragging?: boolean }) {
  return (
    <div
      className="rounded-xl p-3 w-[256px]"
      style={{ background: "var(--panel-2)", border: "1px solid var(--gold)", boxShadow: dragging ? "0 8px 24px rgba(0,0,0,0.4)" : undefined }}
    >
      <div className="text-sm" style={{ color: "var(--ink)" }}>
        {deal.title}
      </div>
      <div className="text-xs font-mono mt-1" style={{ color: "var(--gold)" }}>
        {formatCurrency(deal.value)}
      </div>
    </div>
  );
}

function UrgencyBadge({ deal }: { deal: Deal }) {
  if (deal.stage.startsWith("closed")) return null;
  const score = urgencyScore(deal);
  if (score <= 0) return null;
  const level = urgencyLevel(score);
  if (level === "low") return null;
  return (
    <span
      className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full"
      style={{ background: `${URGENCY_COLORS[level]}22`, color: URGENCY_COLORS[level] }}
    >
      {level}
    </span>
  );
}
