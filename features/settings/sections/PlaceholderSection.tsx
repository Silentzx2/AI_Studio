'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Wrench } from 'lucide-react';

interface PlaceholderSectionProps {
  title: string;
  description: string;
  sectionId: string;
}

export function PlaceholderSection({ title, description, sectionId }: PlaceholderSectionProps) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Coming Soon
          </CardTitle>
          <CardDescription>This settings section is being configured</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Feature in Development</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The {title} settings are being configured and will be available soon.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">Section ID: <code className="text-xs bg-muted px-2 py-1 rounded">{sectionId}</code></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
