const axios = require("axios");
const _ = require("lodash");
const fs = require("fs");
const SCORE_ARRAY = [12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
const scoreSums = ["kills", "revivesGiven", "headshots", "assists", "respawnsGiven", "damageDealt", "hits", "knockdowns", "shots"];

module.exports = function Apex(config) {

    /*
    * Generate stats from inputed data. Stats will get stored 
    * in eventId/round.json and eventId/overall.json
    * 
    * eventId: Arbitrary identifier for this event
    * statsCode: EA API key
    * round: round in this event
    * skipFetch: If true, will skip fetching new results from EA, but will 
    *       regenerate the overall.json up to the passed in round.
    * 
    *       useful if manual adjustments need to be made to a round or you want
    *       to calculate overall stats from a previous round
    */
    async function createStats(eventId, statsCode, round, skipFetch) {
        console.log(eventId, statsCode, round)

        if (!skipFetch) {
            let stats = await getStatsFromEA(statsCode);
            if (!stats || !stats.matches || stats.matches.length == 0) return;
            stats = stats.matches.sort((a, b) => b.match_start - a.match_start);
            const teamData = buildTeams(stats[0].player_results);
            writeStatsFile(eventId, statsCode, round, teamData);
        }

        let statsReport = generateStatsReport(eventId, round);
        return statsReport;
    }

    function generateStatsReport(eventId, round) {
        let stats = [];
        const path = getFilePath(eventId);

        for (let a = 1; a <= round; a++) {
            let file = fs.readFileSync(path + a + ".json");
            stats.push(JSON.parse(file));
        }

        let overall = [];
        let teams = _(stats).map(m => Object.keys(m)).flatten().uniq().value();


        teams.forEach(key => {
            let teamStats = {
                overall_stats: {
                    position: 20,
                    teamName: "",
                    score: 0,
                    bestGame: 0,
                    bestPlacement: 20,
                    bestKills: 0,
                    id: "",
                },
                player_stats: {}
            };
            scoreSums.forEach(key => teamStats.overall_stats[key] = 0);
            stats.forEach(stat => {
                if (stat[key]) {
                    let t = stat[key].overall_stats;
                    teamStats.overall_stats.id = key;
                    if (!teamStats.overall_stats.teamName)
                        teamStats.overall_stats.teamName = t.teamName;
                    teamStats.overall_stats.score += t.score;
                    teamStats.overall_stats.bestGame = Math.max(teamStats.overall_stats.bestGame, t.score);
                    teamStats.overall_stats.bestPlacement = Math.min(teamStats.overall_stats.bestPlacement, t.teamPlacement);
                    teamStats.overall_stats.bestKills = Math.max(teamStats.overall_stats.bestKills, t.kills);
                    scoreSums.forEach(key => teamStats.overall_stats[key] += t[key]);
                    teamStats.overall_stats.accuracy = Math.floor(100 * (teamStats.overall_stats.hits / teamStats.overall_stats.shots)) / 100;

                    let playerStats = stat[key].player_stats;
                    playerStats.forEach(p => {
                        let player = teamStats.player_stats[p.playerName] || {
                            playerName: "",
                        };

                        player.playerName = p.playerName;
                        scoreSums.forEach(key => player[key] = (player[key] || 0) + p[key]);
                        player.accuracy = Math.floor(100 * (player.hits / player.shots)) / 100;
                        teamStats.player_stats[p.playerName] = player;
                    });
                }

            })

            teamStats.player_stats = _.values(teamStats.player_stats);
            overall.push(teamStats);
        });

        overall = overall.sort((a, b) => {
            a = a.overall_stats;
            b = b.overall_stats;
            if (a.score != b.score) {
                return b.score - a.score;
            } else if (a.bestGame != b.bestGame) {
                return b.bestGame - a.bestGame;
            } else if (a.bestPlacement != b.bestPlacement) {
                return a.bestPlacement - b.bestPlacement;
            } else {
                return b.bestKills - a.bestKills;
            }
        });

        overall.forEach((obj, index) => obj.overall_stats.position = index + 1)
        for (let i = 0; i < 20; i++) {
            if (!overall[i]) overall[i] = {
                overall_stats: {
                    position: "",
                    teamName: "",
                    score: "",
                    kills: "",
                },
                player_stats: []
            }
        }
        fs.writeFileSync(getFilePath(eventId) + "overall.json", JSON.stringify(overall));
        return overall;
    }

    function getFilePath(eventId) {
        return config.statsPath + "/" + eventId + "/";
    }

    function writeStatsFile(eventId, statsCode, round, teamData) {
        const path = getFilePath(eventId);

        fs.mkdirSync(path, { recursive: true });
        fs.writeFileSync(path + round + ".json", JSON.stringify(teamData));
    }

    function buildTeams(playerData) {
        let teams = {};
        playerData.forEach(player => {
            let teamId = "team" + player.teamNum;
            if (!teams[teamId]) {
                teams[teamId] = {
                    overall_stats: {
                        teamPlacement: player.teamPlacement,
                        teamName: player.teamName,
                        score: SCORE_ARRAY[player.teamPlacement - 1]
                    },
                    player_stats: []
                };
            }
            let team = teams[teamId];
            team.player_stats.push(player);
            scoreSums.forEach(key => team.overall_stats[key] = (team.overall_stats[key] || 0) + player[key]);
        });
        return teams;
    }

    async function getStatsFromEA(apexCode) {
        let stats = await axios(config['statsUrl'] + apexCode);

        return stats.data;
    }

    return {
        createStats,
    }
}