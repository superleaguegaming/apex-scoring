const axios = require("axios");
const _ = require("lodash");
const scoreArray = [12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
const fs = require("fs");

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

        let roundStats = stats.map(teams => {
            let round = Object.keys(teams)
                .map(key => ({ id: key, ...teams[key].overall_stats }))
                .sort((a, b) => a.teamPlacement - b.teamPlacement);
            for (let i = 0; i < 20; i++) {
                if (!round[i]) round[i] = {
                    teamPlacement: "",
                    teamName: "",
                    score: "",
                    kills: "",
                }
            }
            return round;
        });
        roundStats = _.flatten(roundStats);

        console.log(roundStats);
        fs.writeFileSync(getFilePath(eventId) + "rounds.json", JSON.stringify(roundStats));

        let overall = [];
        let teams = _(stats).map(m => Object.keys(m)).flatten().uniq().value();

        teams.forEach(key => {
            let teamStats = {
                position: 20,
                teamName: "",
                kills: 0,
                damageDealt: 0,
                score: 0,
                bestGame: 0,
                bestPlacement: 20,
                bestKills: 0,
                id: key,
            };
            stats.forEach(stat => {
                if (stat[key]) {
                    let t = stat[key].overall_stats;
                    teamStats.teamName = t.teamName;
                    teamStats.kills += t.kills;
                    teamStats.damageDealt += t.damageDealt;
                    teamStats.score += t.score;
                    teamStats.bestGame = Math.max(teamStats.bestGame, t.score);
                    teamStats.bestPlacement = Math.min(teamStats.bestPlacement, t.teamPlacement);
                    console.log(key, teamStats.bestPlacement, t.teamPlacement);

                    teamStats.bestKills = Math.max(teamStats.bestKills, t.kills);
                }
                console.log()
            })
            overall.push(teamStats);
        });

        overall = overall.sort((a, b) => {
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

        overall.forEach((obj, index) => obj.position = index + 1)
        for (let i = 0; i < 20; i++) {
            if (!overall[i]) overall[i] = {
                position: "",
                teamName: "",
                score: "",
                kills: "",
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
                        kills: 0,
                        damageDealt: 0,
                        teamName: player.teamName,
                        score: scoreArray[player.teamPlacement - 1]
                    },
                    player_stats: []
                };
            }
            let team = teams[teamId];
            team.player_stats.push(player);
            team.overall_stats.kills += player.kills;
            team.overall_stats.score += player.kills;
            team.overall_stats.damageDealt = player.damageDealt;
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