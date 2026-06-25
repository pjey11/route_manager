import { useEffect, useState } from "react";
import { 
  useListVisits, 
  getListVisitsQueryKey,
  useUploadVisits,
  useListVisitDates,
  useStartVisit,
  useCompleteVisit,
  useEndDay,
  useLastHome,
  useUpdateVisitTime,
  useSkipVisit,
  type Visit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Lock, MapPin, Phone, Clock, Upload, CheckCircle2, Check, Bell, ArrowRight, Heart, ExternalLink, Pencil } from "lucide-react";
import { VisitPhotos } from "@/components/visit-photos";

export default function Home() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTime, setEditingTime] = useState("");
  const [confirmEdit, setConfirmEdit] = useState<{ id: number; newTime: string } | null>(null);
  const [skipTarget, setSkipTarget] = useState<Visit | null>(null);
  const [skipConfirmed, setSkipConfirmed] = useState(false);

  const { data: datesData } = useListVisitDates();
  const { data: visitsData, isLoading } = useListVisits(
    { date: selectedDate }, 
    { query: { queryKey: getListVisitsQueryKey({ date: selectedDate }) } }
  );

  const uploadMutation = useUploadVisits();
  const startMutation = useStartVisit();
  const completeMutation = useCompleteVisit();
  const endDayMutation = useEndDay();
  const lastHomeMutation = useLastHome();
  const updateTimeMutation = useUpdateVisitTime();
  const skipMutation = useSkipVisit();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    uploadMutation.mutate(
      { data: { file } },
      {
        onSuccess: (res) => {
          toast.success(`Successfully uploaded ${res.count} visits for ${res.date}`);
          queryClient.invalidateQueries({ queryKey: getListVisitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["listVisitDates"] });
          if (res.date) setSelectedDate(res.date);
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } })?.data?.error || "Failed to upload file";
          toast.error(msg);
        },
        onSettled: () => {
          setUploading(false);
          e.target.value = "";
        }
      }
    );
  };

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: getListVisitsQueryKey({ date: selectedDate }) });
  };

  const handleArrivalNotice = (firstVisit: Visit) => {
    startMutation.mutate(
      { id: firstVisit.id },
      {
        onSuccess: (res) => {
          invalidateList();
          if (res.whatsappSent) {
            toast.success("Arrival notice sent to the group. OmSaiRam!");
          } else {
            toast.warning(`Arrival notice sent${res.whatsappError ? ` — WhatsApp: ${res.whatsappError}` : " (WhatsApp not configured)"}`);
          }
        },
        onError: () => toast.error("Failed to send arrival notice"),
      }
    );
  };

  const handleNextHome = (visit: Visit) => {
    completeMutation.mutate(
      { id: visit.id },
      {
        onSuccess: (res) => {
          invalidateList();
          if (res.whatsappSent) {
            toast.success("Group notified of next home. OmSaiRam!");
          } else {
            toast.warning(`Marked complete${res.whatsappError ? ` — WhatsApp: ${res.whatsappError}` : " (WhatsApp not configured)"}`);
          }
        },
        onError: () => toast.error("Failed to proceed to next home"),
      }
    );
  };

  const handleLastHome = (visit: Visit) => {
    lastHomeMutation.mutate(
      { id: visit.id },
      {
        onSuccess: (res) => {
          invalidateList();
          if (res.whatsappSent) {
            toast.success("Last home announced to the group. OmSaiRam!");
          } else {
            toast.warning(`Announced${res.whatsappError ? ` — WhatsApp: ${res.whatsappError}` : " (WhatsApp not configured)"}`);
          }
        },
        onError: () => toast.error("Failed to announce last home"),
      }
    );
  };

  const handleSkip = () => {
    if (!skipTarget) return;
    skipMutation.mutate(
      { id: skipTarget.id },
      {
        onSuccess: () => {
          invalidateList();
          setSkipTarget(null);
          setSkipConfirmed(false);
          toast.success("Stop skipped.");
        },
        onError: () => toast.error("Failed to skip stop"),
      }
    );
  };

  const handleConfirmTimeUpdate = () => {
    if (!confirmEdit) return;
    updateTimeMutation.mutate(
      { id: confirmEdit.id, data: { visitTime: confirmEdit.newTime } },
      {
        onSuccess: (res) => {
          invalidateList();
          setConfirmEdit(null);
          setEditingId(null);
          toast.success(res.message ?? "Visit times updated");
        },
        onError: () => {
          setConfirmEdit(null);
          toast.error("Failed to update visit time");
        },
      }
    );
  };

  const handleThankYou = (lastVisit: Visit) => {
    endDayMutation.mutate(
      { id: lastVisit.id },
      {
        onSuccess: (res) => {
          invalidateList();
          if (res.whatsappSent) {
            toast.success("Day complete message sent to the group. Jai Sairam!");
          } else {
            toast.warning(`Day ended${res.whatsappError ? ` — WhatsApp: ${res.whatsappError}` : " (WhatsApp not configured)"}`);
          }
        },
        onError: () => toast.error("Failed to complete day"),
      }
    );
  };

  // In-app reminder: 30 mins before first visit
  useEffect(() => {
    if (!visitsData?.visits || visitsData.visits.length === 0) return;
    const today = format(new Date(), "yyyy-MM-dd");
    if (selectedDate !== today) return;

    const firstVisit = visitsData.visits.find(v => v.isFirst);
    if (!firstVisit || firstVisit.status !== "pending") return;

    const timeParts = firstVisit.visitTime.split(":");
    if (timeParts.length < 2) return;
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return;

    const visitDate = new Date();
    visitDate.setHours(hours, minutes, 0, 0);
    const reminderTime = new Date(visitDate.getTime() - 30 * 60000);
    const now = new Date();

    if (reminderTime <= now) return;

    const timeout = reminderTime.getTime() - now.getTime();

    if ("Notification" in window) Notification.requestPermission();

    const timer = setTimeout(() => {
      const reminderText = "OmSaiRam - Time to inform the first devotee of the day";
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Sai Trips Reminder", { body: reminderText });
      }
      toast(reminderText, { duration: 15000 });
    }, timeout);

    return () => clearTimeout(timer);
  }, [visitsData, selectedDate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":   return "bg-gray-100 text-gray-600 border-gray-200";
      case "started":   return "bg-amber-100 text-amber-700 border-amber-200";
      case "completed": return "bg-green-100 text-green-700 border-green-200";
      case "ended":     return "bg-blue-100 text-blue-700 border-blue-200";
      case "day_ended": return "bg-purple-100 text-purple-700 border-purple-200";
      default:          return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":   return "Pending";
      case "started":   return "Active";
      case "completed": return "Completed";
      case "ended":     return "Ended";
      case "day_ended": return "Day Ended";
      default:          return status;
    }
  };

  const isActionPending = startMutation.isPending || completeMutation.isPending || endDayMutation.isPending || lastHomeMutation.isPending;

  const isUnlocked = (visit: Visit, index: number): boolean => {
    if (visit.skipped || visit.status !== "pending") return true;
    const allVisits = visitsData?.visits ?? [];
    // Walk backwards past any skipped stops to find the last real predecessor
    let i = index - 1;
    while (i >= 0) {
      const prev = allVisits[i];
      if (!prev) break;
      if (!prev.skipped) {
        return prev.status !== "pending" && prev.status !== "started";
      }
      i--;
    }
    return true; // no non-skipped predecessor — treat as first stop
  };

  const isDone = (status: string) => ["in_transit", "completed", "ended", "day_ended"].includes(status);

  const visits = visitsData?.visits ?? [];
  const dayStarted = visits.some(v => v.status !== "pending");
  const firstVisit = visits[0];
  const lastVisit = visits[visits.length - 1];
  const lastIndex = visits.length - 1;
  const showArrivalNotice = !isLoading && visits.length > 0 && !dayStarted && !visitsData?.isDayComplete;
  const showThankYou = !isLoading && lastVisit && !isDone(lastVisit.status) && isUnlocked(lastVisit, lastIndex) && !visitsData?.isDayComplete;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary mb-1">Route Schedule</h1>
          <p className="text-muted-foreground text-sm">Manage daily visits and notifications</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[180px] bg-card" data-testid="select-date">
              <SelectValue placeholder="Select date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={format(new Date(), "yyyy-MM-dd")}>Today</SelectItem>
              {datesData?.dates
                .filter(d => d !== format(new Date(), "yyyy-MM-dd"))
                .map(date => (
                  <SelectItem key={date} value={date}>
                    {format(parseISO(date), "MMM d, yyyy")}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={uploading}
              data-testid="input-file-upload"
            />
            <Button variant="outline" className="gap-2" disabled={uploading}>
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading..." : "Upload Excel"}
            </Button>
          </div>
        </div>
      </div>

      {/* Day complete banner */}
      {visitsData?.isDayComplete && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 text-green-800">
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-lg">Sai Day Complete</h3>
            <p className="text-sm opacity-90">All visits for this route have been finished. OmSaiRam.</p>
          </div>
        </div>
      )}

      {/* Arrival Notice button — above the schedule */}
      {showArrivalNotice && (
        <Button
          size="lg"
          className="w-full gap-2 text-base font-semibold shadow-sm"
          onClick={() => handleArrivalNotice(firstVisit)}
          disabled={isActionPending}
          data-testid="button-arrival-notice"
        >
          <Bell className="w-5 h-5" />
          {startMutation.isPending ? "Sending..." : "Palki day begins!"}
        </Button>
      )}

      {/* Visits list */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading route...</div>
        ) : visits.length === 0 ? (
          <Card className="bg-card border-dashed border-2">
            <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center">
              <MapPin className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium">No visits scheduled for this date.</p>
              <p className="text-sm mt-1">Upload an Excel file to get started.</p>
            </CardContent>
          </Card>
        ) : (
          visits.map((visit, index) => {
            const unlocked = isUnlocked(visit, index);
            const done = isDone(visit.status);
            const isLast = visit.isLast;

            return (
              <Card
                key={visit.id}
                data-testid={`card-visit-${visit.id}`}
                className={`transition-all duration-200 ${!unlocked && !done ? "opacity-60" : ""} ${visit.status === "started" ? "ring-2 ring-primary/40 shadow-md" : ""}`}
              >
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row items-stretch">

                    {/* Left: Stop & Time */}
                    <div className={`p-4 md:p-5 md:w-44 flex-shrink-0 flex md:flex-col items-center md:items-start justify-between md:justify-start border-b md:border-b-0 md:border-r border-border ${unlocked && !done ? "bg-primary/5" : "bg-muted/20"}`}>
                      <div className="flex items-center gap-2 md:mb-3">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-sm flex-shrink-0">
                          {visit.stopNumber}
                        </span>
                        {!done && editingId === visit.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="time"
                              value={editingTime}
                              onChange={e => setEditingTime(e.target.value)}
                              className="h-7 w-28 text-sm px-1"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-green-700"
                              onClick={() => {
                                if (editingTime) setConfirmEdit({ id: visit.id, newTime: editingTime });
                              }}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setEditingId(null)}
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1.5 font-medium text-base">
                            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            {visit.visitTime}
                            {!done && (
                              <button
                                onClick={() => { setEditingId(visit.id); setEditingTime(visit.visitTime); }}
                                className="ml-0.5 text-muted-foreground/50 hover:text-primary transition-colors"
                                title="Edit arrival time"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(visit.status)}`}>
                        {getStatusLabel(visit.status)}
                      </div>
                    </div>

                    {/* Middle: Address Info */}
                    <div className="p-4 md:p-5 flex-1 min-w-0">
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 flex-shrink-0" />
                          <span>{visit.phone}</span>
                        </div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${visit.streetAddress}, ${visit.city}, ${visit.postalCode}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 group hover:text-primary transition-colors"
                          title="Open in Google Maps"
                        >
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 group-hover:text-primary" />
                          <span className="line-clamp-2 group-hover:underline">
                            {visit.streetAddress}, {visit.city} {visit.postalCode}
                          </span>
                        </a>
                        {visit.mapUrl && (
                          <a
                            href={visit.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 flex-shrink-0" />
                            <span className="text-xs font-medium">Map</span>
                          </a>
                        )}
                        {visit.prasadOffering && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                              🪔 {visit.prasadOffering}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Action */}
                    <div className="p-4 md:p-5 md:w-52 flex-shrink-0 flex flex-col justify-center border-t md:border-t-0 md:border-l border-border bg-muted/10">
                      {done ? (
                        <div className="flex flex-col items-center justify-center text-green-600 py-2 gap-0.5">
                          <Check className="w-7 h-7 mb-1" />
                          <span className="text-sm font-medium">Complete</span>
                          {visit.completedAt && (
                            <span className="text-xs text-green-700/80 font-normal">
                              {format(new Date(visit.completedAt), "h:mm a")}
                            </span>
                          )}
                          {visit.timeEdited && (
                            <span className="mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                              edited
                            </span>
                          )}
                          {visit.completionNotes && (
                            <span className="mt-1.5 text-[11px] italic text-green-700/70 text-center leading-snug px-1">
                              "{visit.completionNotes}"
                            </span>
                          )}
                        </div>
                      ) : !unlocked ? (
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-2">
                          <Lock className="w-6 h-6 mb-1.5 opacity-40" />
                          <span className="text-xs text-center">Complete previous stops to unlock</span>
                        </div>
                      ) : isLast ? (
                        <Button
                          data-testid={`button-last-home-${visit.id}`}
                          variant="secondary"
                          onClick={() => handleLastHome(visit)}
                          disabled={isActionPending}
                          className="w-full gap-2 text-sm"
                          size="sm"
                        >
                          Palki arrived
                        </Button>
                      ) : (
                        <Button
                          data-testid={`button-next-home-${visit.id}`}
                          onClick={() => handleNextHome(visit)}
                          disabled={isActionPending}
                          className="w-full gap-2 text-sm"
                          size="sm"
                        >
                          Palki Arrived → Next Stop
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
                      {!done && !visit.skipped && (
                        <button
                          onClick={() => { setSkipTarget(visit); setSkipConfirmed(false); }}
                          className="mt-2 text-xs text-muted-foreground/60 hover:text-destructive underline underline-offset-2 transition-colors w-full text-center"
                        >
                          Skip this home
                        </button>
                      )}
                      {visit.skipped && (
                        <span className="mt-2 text-xs text-muted-foreground/50 italic w-full text-center block">Skipped</span>
                      )}
                    </div>

                  </div>

                  <VisitPhotos visitId={visit.id} />
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Thank you button — below all cards */}
      <Dialog open={!!confirmEdit} onOpenChange={open => { if (!open) setConfirmEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Arrival Times</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The arrival time for this address and the rest of the addresses will be adjusted.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmEdit(null)} disabled={updateTimeMutation.isPending}>
              No
            </Button>
            <Button onClick={handleConfirmTimeUpdate} disabled={updateTimeMutation.isPending}>
              {updateTimeMutation.isPending ? "Updating..." : "Yes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip confirmation dialog */}
      <Dialog open={!!skipTarget} onOpenChange={open => { if (!open) { setSkipTarget(null); setSkipConfirmed(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Skip this stop?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Stop <span className="font-medium text-foreground">{skipTarget?.stopNumber}</span> — <span className="font-medium text-foreground">{skipTarget?.streetAddress}</span> will be hidden from the volunteer's view.
          </p>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">Confirm skip</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="skip-confirm"
                  value="yes"
                  checked={skipConfirmed}
                  onChange={() => setSkipConfirmed(true)}
                  className="accent-primary w-4 h-4"
                />
                Yes, skip this home
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                <input
                  type="radio"
                  name="skip-confirm"
                  value="no"
                  checked={!skipConfirmed}
                  onChange={() => setSkipConfirmed(false)}
                  className="accent-primary w-4 h-4"
                />
                No, keep it
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setSkipTarget(null); setSkipConfirmed(false); }} disabled={skipMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSkip} disabled={!skipConfirmed || skipMutation.isPending}>
              {skipMutation.isPending ? "Skipping..." : "Skip Stop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showThankYou && (
        <Button
          size="lg"
          variant="outline"
          className="w-full gap-2 text-base font-semibold border-primary/30 text-primary hover:bg-primary/5 shadow-sm"
          onClick={() => handleThankYou(lastVisit)}
          disabled={isActionPending}
          data-testid="button-thank-you"
        >
          <Heart className="w-5 h-5" />
          {endDayMutation.isPending ? "Sending..." : "Thank you"}
        </Button>
      )}
    </div>
  );
}
