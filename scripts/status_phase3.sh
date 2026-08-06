#!/usr/bin/env bash
# One-line status: is the Phase 3 job still pending?
powershell -NoProfile -Command "\$i=Get-ScheduledTaskInfo -TaskName 'Phase3FeatureSelection' -EA SilentlyContinue; \$t=Get-ScheduledTask -TaskName 'Phase3FeatureSelection' -EA SilentlyContinue; if(\$t){\"PENDING  state=\$(\$t.State)  next=\$(\$i.NextRunTime)  lastResult=\$(\$i.LastTaskResult)\"}else{'NOT SCHEDULED'}"
