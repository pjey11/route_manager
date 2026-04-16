import { useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVisitPhotos,
  useAddVisitPhoto,
  useDeleteVisitPhoto,
  useAnalyzeVisitPhoto,
  getListVisitPhotosQueryKey,
  type VisitPhoto,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Trash2, Users, Loader2, ChevronDown, ChevronUp, ImagePlus } from "lucide-react";

const MAX_PHOTOS = 3;

interface VisitPhotosProps {
  visitId: number;
}

export function VisitPhotos({ visitId }: VisitPhotosProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  const { data, isLoading } = useListVisitPhotos(visitId, {
    query: { queryKey: getListVisitPhotosQueryKey(visitId) },
  });

  const [isUploading, setIsUploading] = useState(false);
  const addMutation = useAddVisitPhoto();
  const deleteMutation = useDeleteVisitPhoto();
  const analyzeMutation = useAnalyzeVisitPhoto();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListVisitPhotosQueryKey(visitId) });

  const uploadPhoto = useCallback(async (file: File): Promise<string | null> => {
    const urlRes = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
    });
    if (!urlRes.ok) throw new Error("Failed to get upload URL");
    const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
    const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
    if (!putRes.ok) throw new Error("Failed to upload file");
    return objectPath;
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Only image files are allowed"); return; }
    if ((data?.photos?.length ?? 0) >= MAX_PHOTOS) { toast.error(`Maximum ${MAX_PHOTOS} photos allowed`); return; }
    setIsUploading(true);
    try {
      const objectPath = await uploadPhoto(file);
      if (!objectPath) return;
      addMutation.mutate(
        { id: visitId, data: { objectPath } },
        {
          onSuccess: () => { invalidate(); toast.success("Photo saved"); },
          onError: () => toast.error("Failed to save photo"),
        }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = (photo: VisitPhoto) => {
    deleteMutation.mutate(
      { id: visitId, photoId: photo.id },
      {
        onSuccess: () => { invalidate(); toast.success("Photo deleted"); },
        onError: () => toast.error("Failed to delete photo"),
      }
    );
  };

  const handleAnalyze = (photo: VisitPhoto) => {
    setAnalyzingId(photo.id);
    analyzeMutation.mutate(
      { id: visitId, photoId: photo.id },
      {
        onSuccess: (res) => {
          invalidate();
          toast.success(`Head count: ${res.headCount} ${res.headCount === 1 ? "person" : "people"} detected`);
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "AI analysis failed";
          toast.error(msg);
        },
        onSettled: () => setAnalyzingId(null),
      }
    );
  };

  const photos = data?.photos ?? [];
  const canAdd = photos.length < MAX_PHOTOS;
  const isBusy = isUploading || addMutation.isPending;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <Camera className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium">
          Photos {photos.length > 0 ? `(${photos.length}/${MAX_PHOTOS})` : `(0/${MAX_PHOTOS})`}
        </span>
        {photos.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-600">
            <Users className="w-3 h-3" />
            {photos.filter(p => p.headCount !== null && p.headCount !== undefined).reduce((sum, p) => sum + (p.headCount ?? 0), 0)} counted
          </span>
        )}
        {expanded ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-2 space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading photos...
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {photos.map(photo => (
                <div key={photo.id} className="relative group w-[calc(33.33%-8px)] min-w-[80px] max-w-[140px]">
                  <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                    <img
                      src={`/api/storage${photo.objectPath}`}
                      alt="Visit photo"
                      className="w-full h-full object-cover"
                    />
                    {photo.headCount !== null && photo.headCount !== undefined && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {photo.headCount}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleDelete(photo)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 bg-white/90 rounded-full text-red-600 hover:bg-white transition-colors"
                        title="Delete photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-1.5 text-xs h-7 px-1"
                    onClick={() => handleAnalyze(photo)}
                    disabled={analyzingId === photo.id}
                  >
                    {analyzingId === photo.id ? (
                      <><Loader2 className="w-3 h-3 animate-spin mr-1" />Counting...</>
                    ) : (
                      <><Users className="w-3 h-3 mr-1" />Count Heads</>
                    )}
                  </Button>
                </div>
              ))}

              {canAdd && (
                <div className="relative w-[calc(33.33%-8px)] min-w-[80px] max-w-[140px]">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className="w-full aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBusy ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-5 h-5" />
                    )}
                    <span className="text-[10px] font-medium">{isBusy ? "Uploading..." : "Add Photo"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {photos.length === 0 && !canAdd && (
                <p className="text-sm text-muted-foreground">No photos yet</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
