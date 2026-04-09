import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { toast } from "sonner";
import { User, Phone, Save, Info } from "lucide-react";
import { format, parseISO } from "date-fns";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^\+?[\d\s\-()]{7,20}$/, "Enter a valid phone number (e.g. +919876543210)"),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function Profile() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", phone: "" },
  });

  useEffect(() => {
    if (profile) {
      form.reset({ name: profile.name, phone: profile.phone });
    }
  }, [profile, form]);

  const onSubmit = (values: ProfileForm) => {
    updateProfile.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["getProfile"] });
          toast.success("Profile saved successfully");
        },
        onError: () => {
          toast.error("Failed to save profile");
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-serif font-bold text-primary mb-1">Profile</h1>
        <p className="text-muted-foreground text-sm">Operator details for reminders and notifications</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Operator Details
          </CardTitle>
          <CardDescription>
            Your name and phone number are used to send you the 30-minute WhatsApp reminder before the first visit of each day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading profile...</div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="e.g. Ramesh Kumar"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp Phone Number</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="+919876543210"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription className="flex items-center gap-1.5 text-xs">
                        <Info className="w-3.5 h-3.5 flex-shrink-0" />
                        Include country code (e.g. +91 for India). This number will receive the 30-min reminder before each day's first visit.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between pt-2">
                  {profile?.updatedAt && profile.name && (
                    <p className="text-xs text-muted-foreground">
                      Last updated {format(parseISO(profile.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={updateProfile.isPending || !form.formState.isDirty}
                    className="ml-auto gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {updateProfile.isPending ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-5 pb-5">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-medium">How reminders work</p>
              <p>30 minutes before the first visit of the day, you will receive a WhatsApp message with the first stop's details — name, time, and address.</p>
              <p className="mt-1">This works even if the app is closed, as long as Twilio is configured.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
