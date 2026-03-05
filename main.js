//habiba 16003112

const fs = require('fs');
//conversions

function timeToSec(timeStr) {
    let cleaned = timeStr.trim();
    let parts = cleaned.split(' '); 
    let timeParts = parts[0].split(':');
    let h = parseInt(timeParts[0]);
    let m = parseInt(timeParts[1]);
    let s = parseInt(timeParts[2]);
    let ampm = parts[1].toLowerCase();

    if (ampm === 'pm' && h < 12) h = h + 12;
    if (ampm === 'am' && h === 12) h = 0;

    return (h * 3600) + (m * 60) + s;}

function durToSec(durStr) {
    let parts = durStr.split(':');
    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    let s = parseInt(parts[2]);
    return (h * 3600) + (m * 60) + s;}

function secToDur(totalSeconds) {
    let h = Math.floor(totalSeconds / 3600);
    let m = Math.floor((totalSeconds % 3600) / 60);
    let s = totalSeconds % 60;
    
    // zeros 
    let displayM = m < 10 ? "0" + m : m;
    let displayS = s < 10 ? "0" + s : s;
    
    return h + ":" + displayM + ":" + displayS;
}

// 1: shift length
function getShiftDuration(startTime, endTime) {
    let start = timeToSec(startTime);
    let end = timeToSec(endTime);
    let diff = end - start;
    return secToDur(diff);
}

// 2: Time outside 8-10
function getIdleTime(startTime, endTime) {
    let start = timeToSec(startTime);
    let end = timeToSec(endTime);
    let dayStart = timeToSec("8:00:00 am");
    let dayEnd = timeToSec("10:00:00 pm");

    let idleSeconds = 0;
    if (start < dayStart) {
        idleSeconds += (dayStart - start);
    }
    if (end > dayEnd) {
        idleSeconds += (end - dayEnd);
    }
    return secToDur(idleSeconds);
}

// 3: Active = Total - Idle
function getActiveTime(shiftDuration, idleTime) {
    let total = durToSec(shiftDuration);
    let idle = durToSec(idleTime);
    return secToDur(total - idle);
}

// 4: worked enough??
function metQuota(date, activeTime) {
    let activeSeconds = durToSec(activeTime);
    let currentDate = new Date(date);
    let eidStart = new Date("2025-04-10");
    let eidEnd = new Date("2025-04-30");

    let requiredSeconds = 0;
    if (currentDate >= eidStart && currentDate <= eidEnd) {
        requiredSeconds = 6 * 3600; 
    } else {
        requiredSeconds = (8 * 3600) + (24 * 60); 
    }

    return activeSeconds >= requiredSeconds;}

// 5:
function addShiftRecord(textFile, shiftObj) {
    let fileContent = fs.readFileSync(textFile, 'utf8').trim();
    let lines = fileContent === "" ? [] : fileContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let cols = lines[i].split(',');
        if (cols[0] === shiftObj.driverID && cols[2] === shiftObj.date) {
            return {};
        }
    }
    let duration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idle = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let active = getActiveTime(duration, idle);
    let quota = metQuota(shiftObj.date, active);

    let newRow = [
        shiftObj.driverID, shiftObj.driverName, shiftObj.date,
        shiftObj.startTime, shiftObj.endTime, duration,
        idle, active, quota, false
    ].join(',');
    let lastPos = -1;
    for (let j = 0; j < lines.length; j++) {
        if (lines[j].split(',')[0] === shiftObj.driverID) {
            lastPos = j;
        }
    }

    if (lastPos === -1) {
        lines.push(newRow); 
    } else {
        lines.splice(lastPos + 1, 0, newRow); 
    }
    fs.writeFileSync(textFile, lines.join('\n') + '\n');
    return {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: duration,
        idleTime: idle,
        activeTime: active,
        metQuota: quota,
        hasBonus: false
    };
}

// 6: Update bonus
function setBonus(textFile, driverID, date, newValue) {
    let content = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let newContent = [];

    for (let line of content) {
        let cols = line.split(',');
        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = newValue.toString();
        }
        newContent.push(cols.join(','));
    }
    fs.writeFileSync(textFile, newContent.join('\n') + '\n');
}
//7: Count 
function countBonusPerMonth(textFile, driverID, month) {
    let content = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let exists = false;
    let count = 0;
    let targetM = parseInt(month);

    for (let line of content) {
        let cols = line.split(',');
        if (cols[0] === driverID) {
            exists = true;
            let rowMonth = parseInt(cols[2].split('-')[1]);
            if (rowMonth === targetM && cols[9].trim() === 'true') {
                count++;
            }
        }
    }
    return exists ? count : -1;}
//  8: Sum active hours
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let content = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let totalS = 0;
    let targetM = parseInt(month);

    for (let line of content) {
        let cols = line.split(',');
        if (cols[0] === driverID && parseInt(cols[2].split('-')[1]) === targetM) {
            totalS += durToSec(cols[7]);
        }
    }
    return secToDur(totalS);
}

// 9: calc hours 
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let rates = fs.readFileSync(rateFile, 'utf8').trim().split('\n');
    let offDay = "";
    for (let r of rates) {
        let c = r.split(',');
        if (c[0] === driverID) offDay = c[1].trim();
    }

    let shifts = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let totalReqS = 0;
    let targetM = parseInt(month);

    for (let s of shifts) {
        let cols = s.split(',');
        if (cols[0] === driverID && parseInt(cols[2].split('-')[1]) === targetM) {
            let dObj = new Date(cols[2]);
            let dayName = dObj.toLocaleDateString('en-US', { weekday: 'long' });
            if (dayName !== offDay) {
                let isEid = dObj >= new Date("2025-04-10") && dObj <= new Date("2025-04-30");
                totalReqS += isEid ? (6 * 3600) : (8 * 3600 + 24 * 60);
            }
        }
    }

    let finalSeconds = totalReqS - (bonusCount * 2 * 3600);
    if (finalSeconds < 0) finalSeconds = 0;
    return secToDur(finalSeconds);
}

//10: Final Pay math!!
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rates = fs.readFileSync(rateFile, 'utf8').trim().split('\n');
    let base = 0, tier = 0;
    for (let r of rates) {
        let c = r.split(',');
        if (c[0] === driverID) {
            base = parseInt(c[2]);
            tier = parseInt(c[3]);
        }
    }
    let actS = durToSec(actualHours);
    let reqS = durToSec(requiredHours);
    if (actS >= reqS) return base;
    let missingS = reqS - actS;
    let allowances = { 1: 50, 2: 20, 3: 10, 4: 3 };
    let allowedS = allowances[tier] * 3600;
    let billableS = missingS - allowedS;
    if (billableS <= 0) return base;
    let billableH = Math.floor(billableS / 3600);
    let ratePerHour = Math.floor(base / 185);
    
    return base - (billableH * ratePerHour);}

module.exports = {
    getShiftDuration, getIdleTime, getActiveTime, metQuota,
    addShiftRecord, setBonus, countBonusPerMonth,
    getTotalActiveHoursPerMonth, getRequiredHoursPerMonth, getNetPay
};