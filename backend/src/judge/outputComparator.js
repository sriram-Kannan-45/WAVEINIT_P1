class OutputComparator {
  constructor(options = {}) {
    this.ignoreTrailingWhitespace = options.ignoreTrailingWhitespace ?? true;
    this.ignoreTrailingBlankLines = options.ignoreTrailingBlankLines ?? true;
    this.ignoreLineEndings = options.ignoreLineEndings ?? true;
    this.floatingPointTolerance = options.floatingPointTolerance ?? null;
    this.unordered = options.unordered ?? false;
    this.caseSensitive = options.caseSensitive ?? true;
  }

  normalize(str) {
    if (!str) return '';
    let s = String(str);
    if (this.ignoreLineEndings) {
      s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
    if (this.ignoreTrailingWhitespace) {
      s = s.replace(/[ \t]+$/gm, '');
    }
    if (this.ignoreTrailingBlankLines) {
      s = s.replace(/\n+$/, '');
    }
    return s;
  }

  compare(actual, expected) {
    if (this.floatingPointTolerance != null) {
      return this.compareFloatingPoint(actual, expected);
    }
    if (this.unordered) {
      return this.compareUnordered(actual, expected);
    }
    const a = this.normalize(actual);
    const e = this.normalize(expected);
    if (a === e) return { match: true, normalizedActual: a, normalizedExpected: e };
    const aTrimmed = a.trimEnd();
    const eTrimmed = e.trimEnd();
    if (aTrimmed === eTrimmed) {
      return { match: true, normalizedActual: aTrimmed, normalizedExpected: eTrimmed, presentation: true };
    }
    return { match: false, normalizedActual: a, normalizedExpected: e };
  }

  compareFloatingPoint(actual, expected) {
    const aLines = this.normalize(actual).split('\n').filter(Boolean);
    const eLines = this.normalize(expected).split('\n').filter(Boolean);
    if (aLines.length !== eLines.length) {
      return { match: false, normalizedActual: aLines.join('\n'), normalizedExpected: eLines.join('\n') };
    }
    for (let i = 0; i < aLines.length; i++) {
      const aVal = parseFloat(aLines[i].trim());
      const eVal = parseFloat(eLines[i].trim());
      if (Number.isNaN(aVal) || Number.isNaN(eVal)) {
        if (aLines[i].trim() !== eLines[i].trim()) {
          return { match: false, normalizedActual: aLines.join('\n'), normalizedExpected: eLines.join('\n') };
        }
        continue;
      }
      if (Math.abs(aVal - eVal) > this.floatingPointTolerance) {
        return { match: false, normalizedActual: aLines.join('\n'), normalizedExpected: eLines.join('\n'), diff: Math.abs(aVal - eVal) };
      }
    }
    return { match: true };
  }

  compareUnordered(actual, expected) {
    const aLines = this.normalize(actual).split('\n').filter(Boolean).sort();
    const eLines = this.normalize(expected).split('\n').filter(Boolean).sort();
    if (aLines.length !== eLines.length) {
      return { match: false, normalizedActual: aLines.join('\n'), normalizedExpected: eLines.join('\n') };
    }
    for (let i = 0; i < aLines.length; i++) {
      if (aLines[i] !== eLines[i]) {
        return { match: false, normalizedActual: aLines.join('\n'), normalizedExpected: eLines.join('\n') };
      }
    }
    return { match: true };
  }
}

module.exports = { OutputComparator };
