module.exports = function suggestTerritory(lead, territories) {
  if (!lead || !territories || !Array.isArray(territories)) return { owner: null, reason: 'Invalid input' };

  const { country, area, city } = lead;
  const normalizedCountry = country?.toLowerCase() || '';
  const normalizedArea = area?.toLowerCase() || '';
  const normalizedCity = city?.toLowerCase() || '';

  const matchingTerritories = territories.filter(t => {
    const tCountry = t.country?.toLowerCase() || '';
    const tArea = t.area?.toLowerCase() || '';
    const tCity = t.city?.toLowerCase() || '';
    return (
      (tCountry === normalizedCountry || tCountry.includes(normalizedCountry)) &&
      (tArea === normalizedArea || tArea.includes(normalizedArea)) &&
      (tCity === normalizedCity || tCity.includes(normalizedCity))
    );
  });

  if (matchingTerritories.length === 0) {
    return { owner: null, reason: 'No matching territory found' };
  }

  if (matchingTerritories.length > 1) {
    return { owner: null, reason: 'Multiple territories match, manual assignment required' };
  }

  return { owner: matchingTerritories[0].owner, reason: 'Territory matched based on location' };
};
