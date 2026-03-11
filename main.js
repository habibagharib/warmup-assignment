const fs = require('fs');

// HELPER 
function timeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const cleanStr = timeStr.trim().toLowerCase();
    const isAmPm = cleanStr.includes('am') || cleanStr.includes('pm');
    let parts = cleanStr.split(' ');
    let time = parts[0];
    let modifier = parts[1];
    let [hours, minutes, seconds] = time.split(':').map(Number);
    if (isAmPm && modifier) {
        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;
    }
    return (hours * 3600) + (minutes * 60) + seconds;
}
function secondsToTimeStr(totalSeconds) {
    const absSeconds = Math.abs(totalSeconds);
    const h = Math.floor(absSeconds / 3600);
    const m = Math.floor((absSeconds % 3600) / 60);
    const s = absSeconds % 60;
    // Format as h:mm:ss (hours don't pad, minutes/seconds do)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
// Func 1
function getShiftDuration(startTime, endTime) {
    let start = timeToSeconds(startTime);
    let end = timeToSeconds(endTime);
    if (end < start) end += 24 * 3600; 
    return secondsToTimeStr(end - start);
}

// Func 2
function getIdleTime(startTime, endTime) {
    let start = timeToSeconds(startTime);
    let end = timeToSeconds(endTime);
    if (end < start) end += 24 * 3600;

    const deliveryStart = 8 * 3600;  
    const deliveryEnd = 22 * 3600;   
    let idleSeconds = 0;
    if (start < deliveryStart) idleSeconds += Math.min(end, deliveryStart) - start;
    if (end > deliveryEnd) idleSeconds += end - Math.max(start, deliveryEnd);
    
    return secondsToTimeStr(idleSeconds);
}
// Func 3
function getActiveTime(shiftDuration, idleTime) {
    let diff = timeToSeconds(shiftDuration) - timeToSeconds(idleTime);
    return secondsToTimeStr(Math.max(0, diff));
}
// Func 4
function metQuota(date, activeTime) {
    const activeSec = timeToSeconds(activeTime);
    const [year, month, day] = date.split('-').map(Number);

    // Eid period: April 10-30, 2025
    if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
        return activeSec >= (6 * 3600);
    }
    return activeSec >= (8 * 3600 + 24 * 60);
}

// Func5
function addShiftRecord(textFile, shiftObj) {
    let raw = fs.readFileSync(textFile, 'utf8').trim();
    let lines = raw ? raw.split('\n') : [];
    if (lines.some(l => l.split(',')[0] === shiftObj.driverID && l.split(',')[2] === shiftObj.date)) {
        return {};
    }

    const duration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idle = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const active = getActiveTime(duration, idle);
    const quota = metQuota(shiftObj.date, active);
    const newRecord = {
        ...shiftObj,
        shiftDuration: duration,
        idleTime: idle,
        activeTime: active,
        metQuota: quota,
        hasBonus: false
    };

    const recordStr = `${newRecord.driverID},${newRecord.driverName},${newRecord.date},${newRecord.startTime},${newRecord.endTime},${newRecord.shiftDuration},${newRecord.idleTime},${newRecord.activeTime},${newRecord.metQuota},${newRecord.hasBonus}`;
    
    let lastIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].split(',')[0] === newRecord.driverID) lastIdx = i;
    }
    if (lastIdx === -1) lines.push(recordStr);
    else lines.splice(lastIdx + 1, 0, recordStr);

    fs.writeFileSync(textFile, lines.join('\n') + '\n');
    return newRecord;
}
// Func6
function setBonus(textFile, driverID, date, newValue) {
    let lines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let updated = lines.map(l => {
        let p = l.split(',');
        if (p[0] === driverID && p[2] === date) {
            p[9] = String(newValue);
            return p.join(',');
        }
        return l;
    });
    fs.writeFileSync(textFile, updated.join('\n') + '\n');
}
// Func 7
function countBonusPerMonth(textFile, driverID, month) {
    let lines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let exists = false;
    let count = 0;
    const targetM = parseInt(month);

    for (let l of lines) {
        let p = l.split(',');
        if (p[0] === driverID) {
            exists = true;
            if (parseInt(p[2].split('-')[1]) === targetM && p[9].trim() === 'true') {
                count++;
            }
        }
    }
    return exists ? count : -1;
}

// Func8
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let lines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let total = 0;
    const targetM = parseInt(month);

    for (let l of lines) {
        let p = l.split(',');
        if (p[0] === driverID && parseInt(p[2].split('-')[1]) === targetM) {
            total += timeToSeconds(p[7]);
        }
    }
    return secondsToTimeStr(total);
}

// Func 9
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const rateData = fs.readFileSync(rateFile, 'utf8').trim().split('\n');
    const driverRate = rateData.find(l => l.startsWith(driverID));
       if (!driverRate) return "0:00:00"; 
    const dayOff = driverRate.split(',')[1].trim().toLowerCase();
    const shifts = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    const targetM = parseInt(month);
    let totalReq = 0;
    const daysArr = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    for (let l of shifts) {
        const p = l.split(',');
        const dateStr = p[2];
        const [y, m, d] = dateStr.split('-').map(Number);

        if (p[0] === driverID && m === targetM) {
            // Use constructor with parts to avoid timezone shifting
            const dayName = daysArr[new Date(y, m - 1, d).getDay()];

            if (dayName !== dayOff) {
                if (m === 4 && d >= 10 && d <= 30) totalReq += 6 * 3600;
                else totalReq += (8 * 3600) + (24 * 60);
            }
        }
    }

    totalReq -= (bonusCount * 2 * 3600);
    return secondsToTimeStr(Math.max(0, totalReq));
}
// Func 10
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateLines = fs.readFileSync(rateFile, 'utf8').trim().split('\n');
    const rate = rateLines.find(l => l.startsWith(driverID)).split(',');
     if (!rate) return 0;
    const basePay = parseInt(rate[2]);
    const tier = parseInt(rate[3]);

    const act = timeToSeconds(actualHours);
    const req = timeToSeconds(requiredHours);
    if (act >= req) return basePay;
    const allowances = [0, 50, 20, 10, 3]; 
    const missingHrs = Math.floor((req - act) / 3600);
    const billableHrs = Math.max(0, missingHrs - allowances[tier]);
    
    const hourlyRate = Math.floor(basePay / 185);
    return basePay - (billableHrs * hourlyRate);
}
module.exports = {
    getShiftDuration, getIdleTime, getActiveTime, metQuota, addShiftRecord,
    setBonus, countBonusPerMonth, getTotalActiveHoursPerMonth, 
    getRequiredHoursPerMonth, getNetPay
};
