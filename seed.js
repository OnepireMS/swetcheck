'use strict';

// Demo data, created on first run (or with `npm run reset`).
// Dates are relative to when you start the server, so "today" is always today.

const crypto = require('crypto');
const id = (n = 5) => crypto.randomBytes(n).toString('hex');

function at(daysAgo, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function hoursAgo(h) {
  const d = new Date(Date.now() - h * 3600e3);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function buildSeed() {
  const lectures = [];
  const ratings = [];

  function lecture(fields, rs) {
    const l = { id: id(), lecturer: '', createdAt: new Date().toISOString(), ...fields };
    lectures.push(l);
    rs.forEach(([usefulness, exam, content, recorded, covered, announcements = ''], i) => {
      ratings.push({
        id: id(6),
        lectureId: l.id,
        voterId: `seed-${l.id}-${i}`,
        usefulness,
        exam,
        content,
        recorded,
        covered,
        announcements,
        createdAt: new Date(Date.parse(l.date) + (70 + i * 9) * 60e3).toISOString(),
      });
    });
  }

  lecture(
    { module: 'COMP0004', moduleName: 'Object-Oriented Programming', title: 'Interfaces and generics', date: hoursAgo(2) },
    []
  );

  lecture(
    { module: 'ENGF0029', moduleName: 'Mathematics for Engineering', title: 'Eigenvalues and diagonalisation', date: at(0, 9) },
    [
      [5, 'yes', 'new', 'yes', 'eigenvalues and eigenvectors from scratch, characteristic polynomial, then diagonalising a 3x3. the worked example at the end is basically a past paper question', 'said diagonalisation comes up on the exam every year'],
      [4, 'yes', 'new', 'yes', 'finding eigenvectors, when a matrix is diagonalisable (repeated eigenvalues edge case), A = PDP^-1', 'problem sheet 4 is due next friday on moodle'],
      [5, 'maybe', 'new', 'yes', 'diagonalisation and using it to compute A^n quickly. went fast in the last 15 min'],
      [4, 'yes', 'mix', 'yes', 'first half was a determinants recap, second half was eigenvalues properly'],
      [3, 'yes', 'new', 'unsure', 'lots of algebra on the board. the 3x3 example was only on the board, not on the slides'],
    ]
  );

  lecture(
    { module: 'ENGF0037', moduleName: 'Applied Science and Experimentation', title: 'Lab report briefing', date: at(1, 15) },
    [
      [2, 'no', 'recap', 'no', 'went over the lab report structure again, same as the moodle page', 'deadline moved to 30 october'],
      [2, 'no', 'recap', 'no', 'mostly admin. report format and referencing', 'every graph now needs error bars or you lose marks, that part is new'],
      [3, 'no', 'mix', 'unsure', 'report guidance plus examples of good vs bad figures', 'deadline is now 30 oct'],
    ]
  );

  lecture(
    { module: 'COMP0005', moduleName: 'Algorithms', title: 'Shortest paths: Dijkstra', date: at(1, 11) },
    [
      [4, 'maybe', 'new', 'yes', "dijkstra with a priority queue, why it breaks with negative edges, runtime O(E log V)"],
      [2, 'maybe', 'mix', 'yes', "honestly the same as the textbook chapter. if you've read it you're fine"],
      [3, 'maybe', 'new', 'yes', 'dijkstra walkthrough, started bellman-ford right at the end', "next week's lab builds on this"],
      [4, 'yes', 'new', 'yes', 'dijkstra plus the proof of correctness. the proof was the hard bit'],
    ]
  );

  lecture(
    { module: 'ENGF0027', moduleName: 'Engineering Projects & Skills', title: 'Guest talk: working in engineering consulting', date: at(3, 14) },
    [
      [2, 'no', 'recap', 'no', 'guest speaker about their career. nice but nothing assessed'],
      [3, 'no', 'recap', 'no', 'career talk with some tips on getting internships'],
      [1, 'no', 'recap', 'no', 'left halfway, nothing to do with the project'],
    ]
  );

  return { lectures, ratings, reports: {} };
}

module.exports = { buildSeed };
