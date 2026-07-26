'use client';

import { useState } from 'react';
import { TimePickerList } from '@/components/influencers/TimePickerList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestTimePickerPage() {
  const [times, setTimes] = useState(['12:00', '14:00']);

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">TimePickerList Test</h1>

      <Card>
        <CardHeader>
          <CardTitle>时间选择器</CardTitle>
        </CardHeader>
        <CardContent>
          <TimePickerList times={times} onChange={setTimes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>当前值</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm">{JSON.stringify(times, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
