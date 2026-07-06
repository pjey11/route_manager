import { useGetVisitsReport, getGetVisitsReportQueryKey } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format, parseISO, subDays, differenceInCalendarDays } from "date-fns";
import { BarChart2, CheckCircle2, Clock, Home, Timer, Users } from "lucide-react";
import { toast } from "sonner";

const MAX_RANGE_DAYS = 30;

export default function Reports() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(today);

  const rangeDays = useMemo(
    () => differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1,
    [startDate, endDate]
  );
  const isRangeValid = rangeDays >= 1 && rangeDays <= MAX_RANGE_DAYS;

  const { data, isLoading } = useGetVisitsReport(
    { startDate, endDate },
    {
      query: {
        queryKey: getGetVisitsReportQueryKey({ startDate, endDate }),
        enabled: isRangeValid,
      },
    }
  );

  const handleStartChange = (value: string) => {
    setStartDate(value);
    if (differenceInCalendarDays(parseISO(endDate), parseISO(value)) + 1 > MAX_RANGE_DAYS) {
      toast.error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    }
  };

  const handleEndChange = (value: string) => {
    setEndDate(value);
    if (differenceInCalendarDays(parseISO(value), parseISO(startDate)) + 1 > MAX_RANGE_DAYS) {
      toast.error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    }
  };

  const summary = data?.summary;
  const trend = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        ...t,
        label: format(parseISO(t.date), "MMM d"),
      })),
    [data]
  );

  const statCards = [
    {
      key: "totalVisits",
      label: "Total Home Visits",
      value: summary?.totalVisits ?? 0,
      icon: Home,
      color: "primary",
    },
    {
      key: "completedVisits",
      label: "Completed",
      value: summary?.completedVisits ?? 0,
      icon: CheckCircle2,
      color: "green",
    },
    {
      key: "remainingVisits",
      label: "Remaining",
      value: summary?.remainingVisits ?? 0,
      icon: Clock,
      color: "amber",
    },
    {
      key: "peopleAttended",
      label: "People Attended",
      value: summary?.peopleAttended ?? 0,
      icon: Users,
      color: "blue",
    },
    {
      key: "avgVisitDurationMinutes",
      label: "Avg Time / Visit (min)",
      value: summary?.avgVisitDurationMinutes ?? "—",
      icon: Timer,
      color: "purple",
    },
    {
      key: "avgVisitsPerDay",
      label: "Avg Homes / Day",
      value: summary?.avgVisitsPerDay ?? 0,
      icon: BarChart2,
      color: "rose",
    },
  ] as const;

  const colorClasses: Record<string, { bg: string; icon: string; text: string }> = {
    primary: { bg: "bg-primary/10", icon: "text-primary", text: "text-primary" },
    green: { bg: "bg-green-100", icon: "text-green-600", text: "text-green-600" },
    amber: { bg: "bg-amber-100", icon: "text-amber-600", text: "text-amber-600" },
    blue: { bg: "bg-blue-100", icon: "text-blue-600", text: "text-blue-600" },
    purple: { bg: "bg-purple-100", icon: "text-purple-600", text: "text-purple-600" },
    rose: { bg: "bg-rose-100", icon: "text-rose-600", text: "text-rose-600" },
  };

  const chartConfig: ChartConfig = {
    value: { label: "Value", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary mb-1">Reports</h1>
          <p className="text-muted-foreground text-sm">Visit analytics and trends over a date range</p>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="startDate" className="text-xs text-muted-foreground">From</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => handleStartChange(e.target.value)}
              className="w-[150px] bg-card"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="endDate" className="text-xs text-muted-foreground">To</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              min={startDate}
              max={today}
              onChange={(e) => handleEndChange(e.target.value)}
              className="w-[150px] bg-card"
            />
          </div>
        </div>
      </div>

      {!isRangeValid && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-2.5">
          Please select a valid date range of {MAX_RANGE_DAYS} days or fewer.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(({ key, label, value, icon: Icon, color }) => {
          const c = colorClasses[color];
          return (
            <Card key={key}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${c.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${c.icon}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-2xl font-bold ${c.text} truncate`}>{isLoading ? "—" : value}</p>
                    <p className="text-xs text-muted-foreground truncate">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Trend Charts */}
      {isRangeValid && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { key: "totalVisits", title: "Total Home Visits" },
            { key: "completedVisits", title: "Completed Visits" },
            { key: "remainingVisits", title: "Remaining Visits" },
            { key: "peopleAttended", title: "People Attended" },
            { key: "avgVisitDurationMinutes", title: "Avg Time / Visit (min)" },
          ].map(({ key, title }) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    Loading...
                  </div>
                ) : trend.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    No data for this range
                  </div>
                ) : (
                  <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
                    <LineChart data={trend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} width={30} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey={key}
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
