import { useState } from "react";
import { useSendBulkNotification, useListTemplates, useListVisits, getListVisitsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, Users, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";

export default function Instructions() {
  const [date, setDate] = useState<Date>(new Date());
  const formattedDate = format(date, "yyyy-MM-dd");
  
  const { data: templatesData } = useListTemplates();
  const { data: visitsData, isLoading: isLoadingVisits } = useListVisits(
    { date: formattedDate },
    { query: { queryKey: getListVisitsQueryKey({ date: formattedDate }) } }
  );
  
  const sendBulk = useSendBulkNotification();
  const [result, setResult] = useState<{sent: number, failed: number, total: number} | null>(null);

  const instructionsTemplate = templatesData?.templates.find(t => t.name === "Bulk Instructions");
  const contactCount = visitsData?.visits.length || 0;

  const handleSend = () => {
    if (contactCount === 0) {
      toast.error("No contacts found for this date");
      return;
    }

    sendBulk.mutate(
      { data: { date: formattedDate } },
      {
        onSuccess: (res) => {
          setResult({
            sent: res.sent,
            failed: res.failed,
            total: res.total
          });
          toast.success(`Sent successfully to ${res.sent} contacts`);
        },
        onError: () => {
          toast.error("Failed to send bulk instructions");
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-primary mb-1">Bulk Instructions</h1>
        <p className="text-muted-foreground text-sm">Send standard instructions to all devotees for a specific day</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Date</CardTitle>
              <CardDescription>Choose the route date</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => { if(d) { setDate(d); setResult(null); } }}
                className="rounded-md border shadow-sm"
              />
            </CardContent>
            <CardFooter className="bg-muted/30 border-t flex justify-between py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="w-4 h-4 text-primary" />
                {isLoadingVisits ? "Loading..." : `${contactCount} contacts`}
              </div>
            </CardFooter>
          </Card>

          {result && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total contacts:</span>
                    <span className="font-medium">{result.total}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Successfully sent:</span>
                    <span className="font-medium text-green-600">{result.sent}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Failed:</span>
                    <span className="font-medium text-destructive">{result.failed}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Message Preview</CardTitle>
              <CardDescription>This message will be sent exactly as shown to all {contactCount} contacts on {format(date, "MMM d, yyyy")}. You can edit this template in the Notifications tab.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="bg-muted p-6 rounded-lg whitespace-pre-wrap font-mono text-sm h-full min-h-[200px] border">
                {instructionsTemplate?.content || "Loading template..."}
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button 
                className="w-full py-6 text-lg shadow-md"
                onClick={handleSend}
                disabled={sendBulk.isPending || contactCount === 0 || !instructionsTemplate}
              >
                <Send className="w-5 h-5 mr-2" />
                {sendBulk.isPending ? "Sending..." : `Send Instructions to ${contactCount} Contacts`}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
