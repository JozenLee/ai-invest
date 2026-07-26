'use client';

import { useState } from 'react';
import { ScheduleConfigPanel } from '@/components/influencers/ScheduleConfigPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestSchedulePage() {
  const [scheduleType, setScheduleType] = useState<'polling' | 'daily'>('polling');
  const [fetchInterval, setFetchInterval] = useState(30);
  const [dailyFetchTimes, setDailyFetchTimes] = useState(['12:00', '14:00']);

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">ScheduleConfigPanel Test</h1>

      <Card>
        <CardHeader>
          <CardTitle>调度配置</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleConfigPanel
            scheduleType={scheduleType}
            onScheduleTypeChange={setScheduleType}
            fetchInterval={fetchInterval}
            onFetchIntervalChange={setFetchInterval}
            dailyFetchTimes={dailyFetchTimes}
            onDailyFetchTimesChange={setDailyFetchTimes}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>当前配置</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm">
            {JSON.stringify({ scheduleType, fetchInterval, dailyFetchTimes }, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
