import { useState } from "react";
import { useListTemplates, getListTemplatesQueryKey, useUpdateTemplate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Info, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function Notifications() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListTemplates();
  const updateTemplate = useUpdateTemplate();
  
  const [editingValues, setEditingValues] = useState<Record<number, string>>({});

  const handleContentChange = (id: number, value: string) => {
    setEditingValues(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = (id: number) => {
    const content = editingValues[id];
    if (!content) return;

    updateTemplate.mutate(
      { id, data: { content } },
      {
        onSuccess: () => {
          toast.success("Template saved successfully");
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          setEditingValues(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        },
        onError: () => {
          toast.error("Failed to save template");
        }
      }
    );
  };

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-primary mb-1">Message Templates</h1>
        <p className="text-muted-foreground text-sm">Manage WhatsApp notifications sent to devotees</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data?.templates.map((template) => {
          const isEditing = template.id in editingValues;
          const content = isEditing ? editingValues[template.id] : template.content;
          const hasChanges = isEditing && editingValues[template.id] !== template.content;

          return (
            <Card key={template.id} className="flex flex-col shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <CardTitle className="text-lg font-medium">{template.name}</CardTitle>
                    <CardDescription className="mt-1.5">{template.description}</CardDescription>
                  </div>
                  {template.updatedAt && (
                    <div className="flex items-center text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md shrink-0">
                      <Clock className="w-3 h-3 mr-1" />
                      {format(parseISO(template.updatedAt), "MMM d")}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <Textarea 
                  value={content}
                  onChange={(e) => handleContentChange(template.id, e.target.value)}
                  className="min-h-[120px] resize-none mb-4 font-mono text-sm bg-muted/30 focus-visible:ring-primary/50"
                  placeholder="Enter message template..."
                />
                
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center text-xs text-muted-foreground bg-primary/5 text-primary px-3 py-1.5 rounded-full border border-primary/10">
                    <Info className="w-3.5 h-3.5 mr-1.5" />
                    <span><code className="font-semibold px-1 py-0.5 bg-background rounded">{'{name}'}</code> will be replaced with devotee name</span>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleSave(template.id)}
                    disabled={!hasChanges || updateTemplate.isPending}
                    className="shrink-0 transition-all"
                    variant={hasChanges ? "default" : "secondary"}
                  >
                    <Save className="w-4 h-4 mr-1.5" />
                    {updateTemplate.isPending && isEditing ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
