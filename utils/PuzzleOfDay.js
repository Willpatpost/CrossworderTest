export function getNewYorkDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
    });

    const parts = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );

    return {
        dateKey: `${parts.year}-${parts.month}-${parts.day}`,
        hour: Number(parts.hour)
    };
}

export function pickPuzzleForDate(entries, dateKey) {
    const eligibleEntries = (entries || []).filter((entry) => entry?.dailyEligible !== false);
    if (!eligibleEntries.length) {
        return null;
    }

    const seed = Number(dateKey.replaceAll('-', ''));
    return eligibleEntries[seed % eligibleEntries.length];
}
