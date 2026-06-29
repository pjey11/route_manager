import { useListVisitDates, useListVisits, getListVisitsQueryKey } from "@workspace/api-client-react";
import { formatTime12h } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { BarChart2, CheckCircle2, Clock, MapPin, Users } from "lucide-react";

export default function Reports() {
  const { data: datesData } = useListVisitDates();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const { data: visitsData, isLoading } = useListVisits(
    { date: selectedDate },
    { query: { queryKey: getListVisitsQueryKey({ date: selectedDate }) } }
  );

  const visits = visitsData?.visits ?? [];
  const total = visits.length;
  const completed = visits.filter(v => ["completed", "ended", "day_ended"].includes(v.status)).length;
  const pending = visits.filter(v => v.status === "pending").length;
  const active = visits.filter(v => v.status === "started").length;
  const isDayComplete = visitsData?.isDayComplete ?? false;
  const totalAttended = visits.reduce((sum, v) => sum + (v.devoteesAttended ?? 0), 0);

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-gray-100 text-gray-600";
      case "started": return "bg-amber-100 text-amber-700";
      case "completed": return "bg-green-100 text-green-700";
      case "ended": return "bg-blue-100 text-blue-700";
      case "day_ended": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pending";
      case "started": return "Active";
      case "completed": return "Completed";
      case "ended": return "Ended";
      case "day_ended": return "Day Ended";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary mb-1">Reports</h1>
          <p className="text-muted-foreground text-sm">Daily visit summary and status overview</p>
        </div>

        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="w-[180px] bg-card">
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-muted-foreground">Total Visits</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{active + pending}</p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isDayComplete ? "bg-purple-100" : "bg-gray-100"}`}>
                <BarChart2 className={`w-4 h-4 ${isDayComplete ? "text-purple-600" : "text-gray-400"}`} />
              </div>
              <div>
                <p className={`text-sm font-bold ${isDayComplete ? "text-purple-600" : "text-gray-400"}`}>
                  {isDayComplete ? "Complete" : total > 0 ? `${Math.round((completed / total) * 100)}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Day Status</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{totalAttended > 0 ? totalAttended : "—"}</p>
                <p className="text-xs text-muted-foreground">People Attended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visit Detail Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Visit Log — {format(parseISO(selectedDate), "MMMM d, yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading...</div>
          ) : visits.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <MapPin className="w-8 h-8 opacity-20" />
              <p>No visits for this date</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visits.map((visit) => (
                <div key={visit.id} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {visit.stopNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{visit.stopNumber}. {formatTime12h(visit.visitTime)}</p>
                    <p className="text-xs text-muted-foreground truncate">{visit.streetAddress}, {visit.city}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:block">{formatTime12h(visit.visitTime)}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor(visit.status)}`}>
                      {statusLabel(visit.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
