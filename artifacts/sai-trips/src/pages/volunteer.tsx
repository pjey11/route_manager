import { useState } from "react";
import {
  useListVisits,
  useListVisitDates,
  getListVisitsQueryKey,
  useVolunteerComplete,
  useGetMe,
  type Visit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Clock, CheckCircle2, LogOut, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

function getLocalTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatTimeDisplay(timeStr: string): string {
  const [hh, mm] = timeStr.split(":");
  const h = parseInt(hh, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${period}`;
}

function buildISOTimestamp(timeStr: string): string {
  const [hh, mm] = timeStr.split(":");
  const d = new Date();
  d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return d.toISOString();
}

function formatAddress(visit: Visit): string {
  return `${visit.streetAddress}, ${visit.city} ${visit.postalCode}`;
}

interface ConfirmModalProps {
  visit: Visit;
  onClose: () => void;
  onConfirm: (completedAt: string, timeEdited: boolean, notes: string) => void;
  isPending: boolean;
}

function ConfirmModal({ visit, onClose, onConfirm, isPending }: ConfirmModalProps) {
  const [time, setTime] = useState<string>(getLocalTime);
  const [originalTime] = useState<string>(getLocalTime);
  const [affirmation, setAffirmation] = useState("");
  const [notes, setNotes] = useState("");

  const confirmed = affirmation.trim().toLowerCase() === "yes";
  const address = formatAddress(visit);

  const handleConfirm = () => {
    const timeEdited = time !== originalTime;
    onConfirm(buildISOTimestamp(time), timeEdited, notes.trim());
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Confirm Completion</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm leading-relaxed text-foreground">
            The Palki has completed the stop at{" "}
            <span className="font-medium">{address}</span>{" "}
            at{" "}
            <span className="font-semibold text-primary">{formatTimeDisplay(time)}</span>.
            Confirm.
          </p>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Adjust time if needed</label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Notes <span className="text-muted-foreground/60">(optional)</span></label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. devotee was not home, extra attendees…"
              className="text-sm resize-none"
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">
              Type <span className="font-semibold text-foreground">Yes</span> to confirm
            </label>
            <Input
              value={affirmation}
              onChange={(e) => setAffirmation(e.target.value)}
              placeholder="Type Yes..."
              className="text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 flex-row">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!confirmed || isPending}
            className="flex-1"
          >
            {isPending ? "Saving..." : "Yes, Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Volunteer() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const { data: datesData } = useListVisitDates();
  const { data: visitsData, isLoading } = useListVisits(
    { date: selectedDate },
    { query: { queryKey: getListVisitsQueryKey({ date: selectedDate }) } }
  );
  const volunteerComplete = useVolunteerComplete();
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setLocation("/login");
  };

  const handleConfirm = (completedAt: string, timeEdited: boolean, notes: string) => {
    if (!selectedVisit) return;
    volunteerComplete.mutate(
      { id: selectedVisit.id, data: { completedAt, timeEdited, notes: notes || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVisitsQueryKey({ date: selectedDate }) });
          setSelectedVisit(null);
          toast.success("Stop marked complete. OmSaiRam!");
        },
        onError: () => toast.error("Failed to mark stop complete"),
      }
    );
  };

  const visits = visitsData?.visits ?? [];
  const activeIndex = visitsData?.activeIndex;
  const currentVisit = activeIndex !== undefined ? visits[activeIndex] : undefined;
  const upcomingVisits = visits.filter((v, i) =>
    (v.status === "pending" || v.status === "started") && i !== activeIndex
  );
  const doneVisits = visits.filter(v => !["pending", "started"].includes(v.status));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":   return "bg-gray-100 text-gray-600 border-gray-200";
      case "started":   return "bg-amber-100 text-amber-700 border-amber-200";
      case "completed": return "bg-green-100 text-green-700 border-green-200";
      default:          return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":   return "Pending";
      case "started":   return "En Route";
      case "completed": return "Completed";
      default:          return status;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-serif font-bold text-primary">Seva Schedule</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{me?.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-muted-foreground flex-shrink-0">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>

        {/* Date selector */}
        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="w-full bg-card">
            <SelectValue placeholder="Select date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={today}>Today — {format(parseISO(today), "MMM d, yyyy")}</SelectItem>
            {datesData?.dates
              .filter(d => d !== today)
              .map(date => (
                <SelectItem key={date} value={date}>
                  {format(parseISO(date), "MMM d, yyyy")}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Loading */}
        {isLoading && (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading visits…</div>
        )}

        {/* No visits */}
        {!isLoading && visits.length === 0 && (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center">
              <MapPin className="w-10 h-10 mb-3 opacity-20" />
              <p className="font-medium text-sm">No visits scheduled for this date.</p>
            </CardContent>
          </Card>
        )}

        {/* Current active visit */}
        {currentVisit && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Stop</p>
            <Card className={`${currentVisit.status === "started" ? "ring-2 ring-primary/40 shadow-md" : "ring-1 ring-primary/20"}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary font-bold text-xs flex-shrink-0">
                      {currentVisit.stopNumber}
                    </span>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      {currentVisit.visitTime}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(currentVisit.status)}`}>
                    {getStatusLabel(currentVisit.status)}
                  </span>
                </div>

                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${currentVisit.streetAddress}, ${currentVisit.city}, ${currentVisit.postalCode}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                >
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 group-hover:text-primary" />
                  <span className="group-hover:underline">
                    {currentVisit.streetAddress}, {currentVisit.city} {currentVisit.postalCode}
                  </span>
                </a>

                {currentVisit.mapUrl && (
                  <a
                    href={currentVisit.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-medium">Map</span>
                  </a>
                )}
                {currentVisit.prasadOffering && (
                  <span className="inline-block text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                    🪔 {currentVisit.prasadOffering}
                  </span>
                )}

                <Button
                  className="w-full"
                  onClick={() => setSelectedVisit(currentVisit)}
                  disabled={volunteerComplete.isPending}
                >
                  Complete Trip
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Upcoming visits — no action button */}
        {upcomingVisits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming</p>
            {upcomingVisits.map((visit) => (
              <div key={visit.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground font-bold text-xs flex-shrink-0">
                  {visit.stopNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{visit.streetAddress}, {visit.city}</p>
                  <p className="text-xs text-muted-foreground">{visit.visitTime}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Completed visits */}
        {doneVisits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</p>
            {doneVisits.map((visit) => (
              <div key={visit.id} className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-900 truncate">
                    Stop {visit.stopNumber} — {visit.streetAddress}
                  </p>
                  <p className="text-xs text-green-700">{visit.visitTime}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Confirmation modal */}
      {selectedVisit && (
        <ConfirmModal
          visit={selectedVisit}
          onClose={() => setSelectedVisit(null)}
          onConfirm={handleConfirm}
          isPending={volunteerComplete.isPending}
        />
      )}
    </div>
  );
}
