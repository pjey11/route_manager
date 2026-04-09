import { useEffect, useState } from "react";
import { 
  useListVisits, 
  getListVisitsQueryKey,
  useUploadVisits,
  useListVisitDates,
  useStartVisit,
  useCompleteVisit,
  useEndVisit,
  useEndDay,
  type Visit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Lock, MapPin, Phone, Clock, Upload, CheckCircle2, Check } from "lucide-react";
import { GeofenceWatcher } from "@/components/geofence-watcher";

export default function Home() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [uploading, setUploading] = useState(false);

  const { data: datesData } = useListVisitDates();
  const { data: visitsData, isLoading } = useListVisits(
    { date: selectedDate }, 
    { query: { queryKey: getListVisitsQueryKey({ date: selectedDate }) } }
  );

  const uploadMutation = useUploadVisits();
  const startMutation = useStartVisit();
  const completeMutation = useCompleteVisit();
  const endMutation = useEndVisit();
  const endDayMutation = useEndDay();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

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

  const handleStart = (visit: Visit) => {
    startMutation.mutate(
      { id: visit.id },
      {
        onSuccess: (res) => {
          invalidateList();
          if (res.whatsappSent) {
            toast.success(`Arrival notice sent to ${visit.name}`);
          } else {
            toast.warning(`Visit started${res.whatsappError ? ` — WhatsApp: ${res.whatsappError}` : " (WhatsApp not configured)"}`);
          }
        },
        onError: () => toast.error("Failed to start visit"),
      }
    );
  };

  const handleComplete = (visit: Visit) => {
    completeMutation.mutate(
      { id: visit.id },
      {
        onSuccess: (res) => {
          invalidateList();
          if (res.whatsappSent) {
            toast.success(`Visit completed. Messages sent.`);
          } else {
            toast.warning(`Visit completed${res.whatsappError ? ` — WhatsApp: ${res.whatsappError}` : " (WhatsApp not configured)"}`);
          }
        },
        onError: () => toast.error("Failed to complete visit"),
      }
    );
  };

  const handleEnd = (visit: Visit) => {
    endMutation.mutate(
      { id: visit.id },
      {
        onSuccess: (res) => {
          invalidateList();
          if (res.whatsappSent) {
            toast.success(`Thank you message sent to ${visit.name}`);
          } else {
            toast.warning(`Visit ended${res.whatsappError ? ` — WhatsApp: ${res.whatsappError}` : " (WhatsApp not configured)"}`);
          }
        },
        onError: () => toast.error("Failed to end visit"),
      }
    );
  };

  const handleEndDay = (visit: Visit) => {
    endDayMutation.mutate(
      { id: visit.id },
      {
        onSuccess: () => {
          invalidateList();
          toast.success("Sai day completed. OmSaiRam!");
        },
        onError: () => toast.error("Failed to end day"),
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

    if ("Notification" in window) {
      Notification.requestPermission();
    }

    const timer = setTimeout(() => {
      const reminderText = "OmSaiRam - Time to inform the first devotee of the day";
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Sai Trips Reminder", {
          body: reminderText,
        });
      }
      toast(reminderText, { duration: 15000 });
    }, timeout);

    return () => clearTimeout(timer);
  }, [visitsData, selectedDate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-gray-100 text-gray-600 border-gray-200";
      case "started": return "bg-amber-100 text-amber-700 border-amber-200";
      case "completed": return "bg-green-100 text-green-700 border-green-200";
      case "ended": return "bg-blue-100 text-blue-700 border-blue-200";
      case "day_ended": return "bg-purple-100 text-purple-700 border-purple-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pending";
      case "started": return "Active";
      case "completed": return "Completed";
      case "ended": return "Ended";
      case "day_ended": return "Day Ended";
      default: return status;
    }
  };

  const isActionPending = startMutation.isPending || completeMutation.isPending || endMutation.isPending || endDayMutation.isPending;
  const activeVisit = visitsData?.visits.find(v => v.status === "started");

  const isUnlocked = (visit: Visit, index: number): boolean => {
    if (visit.status !== "pending") return true;
    if (index === 0) return true;
    const prev = visitsData?.visits[index - 1];
    if (!prev) return false;
    return prev.status !== "pending" && prev.status !== "started";
  };

  const isDone = (status: string) => ["completed", "ended", "day_ended"].includes(status);

  return (
    <div className="space-y-6">
      <GeofenceWatcher activeVisit={activeVisit} />
      
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

      {/* Visits list */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading route...</div>
        ) : !visitsData?.visits || visitsData.visits.length === 0 ? (
          <Card className="bg-card border-dashed border-2">
            <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center">
              <MapPin className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium">No visits scheduled for this date.</p>
              <p className="text-sm mt-1">Upload an Excel file to get started.</p>
            </CardContent>
          </Card>
        ) : (
          visitsData.visits.map((visit, index) => {
            const unlocked = isUnlocked(visit, index);
            const done = isDone(visit.status);

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
                        <span className="flex items-center gap-1.5 font-medium text-base">
                          <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          {visit.visitTime}
                        </span>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(visit.status)}`}>
                        {getStatusLabel(visit.status)}
                      </div>
                    </div>

                    {/* Middle: Contact Info */}
                    <div className="p-4 md:p-5 flex-1 min-w-0">
                      <h3 className="text-lg font-semibold mb-2 truncate">{visit.name}</h3>
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 flex-shrink-0" />
                          <span>{visit.phone}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{visit.address}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="p-4 md:p-5 md:w-60 flex-shrink-0 flex flex-col justify-center border-t md:border-t-0 md:border-l border-border bg-muted/10">
                      {done ? (
                        <div className="flex flex-col items-center justify-center text-green-600 py-2">
                          <Check className="w-7 h-7 mb-1" />
                          <span className="text-sm font-medium">Complete</span>
                        </div>
                      ) : !unlocked ? (
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-2">
                          <Lock className="w-6 h-6 mb-1.5 opacity-40" />
                          <span className="text-xs text-center">Complete previous stops to unlock</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* First visit buttons */}
                          {visit.isFirst && (
                            <>
                              {visit.status === "pending" && (
                                <Button
                                  data-testid={`button-start-${visit.id}`}
                                  onClick={() => handleStart(visit)}
                                  disabled={isActionPending}
                                  className="w-full text-sm"
                                  size="sm"
                                >
                                  Sai Palki starts
                                </Button>
                              )}
                              <Button
                                data-testid={`button-complete-${visit.id}`}
                                variant="secondary"
                                onClick={() => handleComplete(visit)}
                                disabled={isActionPending}
                                className="w-full text-sm"
                                size="sm"
                              >
                                Bikhsa received. Palki continues
                              </Button>
                            </>
                          )}

                          {/* Middle visit buttons */}
                          {!visit.isFirst && !visit.isLast && (
                            <Button
                              data-testid={`button-complete-${visit.id}`}
                              onClick={() => handleComplete(visit)}
                              disabled={isActionPending}
                              className="w-full text-sm"
                              size="sm"
                            >
                              Bikhsa received. Palki continues
                            </Button>
                          )}

                          {/* Last visit buttons */}
                          {visit.isLast && (
                            <>
                              <Button
                                data-testid={`button-end-${visit.id}`}
                                onClick={() => handleEnd(visit)}
                                disabled={isActionPending || visit.status === "ended"}
                                className="w-full text-sm"
                                size="sm"
                              >
                                Sai Palki ends
                              </Button>
                              <Button
                                data-testid={`button-end-day-${visit.id}`}
                                variant="outline"
                                onClick={() => handleEndDay(visit)}
                                disabled={isActionPending || visit.status === "pending"}
                                className="w-full text-sm text-green-700 border-green-200 hover:bg-green-50"
                                size="sm"
                              >
                                Ending Sai day
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
