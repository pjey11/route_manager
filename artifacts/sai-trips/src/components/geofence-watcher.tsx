import { useEffect, useState } from "react";
import { getDistanceInMeters } from "@/lib/geo";
import { useSendGeofenceMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { type Visit } from "@workspace/api-client-react";

export function GeofenceWatcher({ activeVisit }: { activeVisit?: Visit }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const sendGeofenceMessage = useSendGeofenceMessage();

  useEffect(() => {
    if (!activeVisit || !activeVisit.lat || !activeVisit.lng) {
      setShowPrompt(false);
      return;
    }

    const checkKey = `geofence_${activeVisit.id}`;
    if (localStorage.getItem(checkKey)) {
      setShowPrompt(false);
      return;
    }

    const checkLocation = () => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
          const dist = getDistanceInMeters(
            position.coords.latitude,
            position.coords.longitude,
            activeVisit.lat!,
            activeVisit.lng!
          );
          
          if (dist <= 500) {
            setShowPrompt(true);
          }
        }, (err) => {
          console.error("Geolocation error", err);
        });
      }
    };

    checkLocation();
    const interval = setInterval(checkLocation, 30000);
    return () => clearInterval(interval);
  }, [activeVisit]);

  const handleSend = () => {
    if (!activeVisit) return;
    sendGeofenceMessage.mutate(
      { id: activeVisit.id },
      {
        onSuccess: () => {
          toast.success("Arrival notice sent successfully");
          localStorage.setItem(`geofence_${activeVisit.id}`, "true");
          setShowPrompt(false);
        },
        onError: () => {
          toast.error("Failed to send arrival notice");
        }
      }
    );
  };

  if (!showPrompt || !activeVisit) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-96 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-primary text-primary-foreground p-4 rounded-lg shadow-xl flex flex-col gap-3 border-2 border-primary-border">
        <div className="flex items-center gap-2 font-medium">
          <MapPin className="h-5 w-5" />
          <span>Approaching {activeVisit.name}'s Home</span>
        </div>
        <p className="text-sm opacity-90">
          You are within 500 meters of the next stop.
        </p>
        <div className="flex justify-end gap-2 mt-2">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => {
              localStorage.setItem(`geofence_${activeVisit.id}`, "dismissed");
              setShowPrompt(false);
            }}
          >
            Dismiss
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleSend}
            disabled={sendGeofenceMessage.isPending}
            className="bg-white text-primary hover:bg-white/90"
          >
            {sendGeofenceMessage.isPending ? "Sending..." : "Send Arrival Notice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
