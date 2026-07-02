/* --------------------------------------------------
 * SkyFlow Client Logic
 * -------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  // Dismiss splash screen after 2.5s
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 800);
    }
  }, 2500);

  // Elements
  const themeToggle = document.getElementById('theme-toggle');
  const searchForm = document.getElementById('search-form');
  const cityInput = document.getElementById('city-input');
  const geoBtn = document.getElementById('geo-btn');
  const loader = document.getElementById('loader');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
  const autocompleteSpinner = document.getElementById('autocomplete-spinner');

  // Weather Info Elements
  const locationName = document.getElementById('location-name');
  const weatherDescription = document.getElementById('weather-description');
  const currentTemp = document.getElementById('current-temp');
  const tempMin = document.getElementById('temp-min');
  const tempMax = document.getElementById('temp-max');
  const weatherMainIcon = document.getElementById('weather-main-icon');
  const weatherIconPlaceholder = document.getElementById('weather-icon-placeholder');

  // Detail Cards Elements
  const windSpeed = document.getElementById('wind-speed');
  const windDir = document.getElementById('wind-dir');
  const humidity = document.getElementById('humidity');
  const humidityDesc = document.getElementById('humidity-desc');
  const pressure = document.getElementById('pressure');
  const pressureDesc = document.getElementById('pressure-desc');
  const feelsLike = document.getElementById('feels-like');
  const feelsLikeDiff = document.getElementById('feels-like-diff');
  const sunrise = document.getElementById('sunrise');
  const sunriseTimeTo = document.getElementById('sunrise-time-to');
  const sunset = document.getElementById('sunset');
  const sunsetTimeTo = document.getElementById('sunset-time-to');

  // Forecast Container
  const forecastContainer = document.getElementById('forecast-container');

  // Clock Variables
  let currentCityTimezoneOffset = 0;
  let clockIntervalId = null;

  // Initialize Dark/Light Theme from localStorage
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Temperature click bounce
  const tempTrigger = document.getElementById('temp-trigger');
  if (tempTrigger) {
    tempTrigger.addEventListener('click', () => {
      currentTemp.classList.add('bounce-pulse');
      setTimeout(() => currentTemp.classList.remove('bounce-pulse'), 500);
    });
  }

  // Button ripple effects
  const addRippleEffect = (btn) => {
    btn.addEventListener('click', (e) => {
      const circle = document.createElement('span');
      const diameter = Math.max(btn.clientWidth, btn.clientHeight);
      const radius = diameter / 2;
      const rect = btn.getBoundingClientRect();

      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${e.clientX - rect.left - radius}px`;
      circle.style.top = `${e.clientY - rect.top - radius}px`;
      circle.classList.add('ripple');

      const existing = btn.querySelector('.ripple');
      if (existing) existing.remove();

      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);
    });
  };

  // Add ripples to search and locate buttons
  const searchBtn = document.querySelector('.btn-search');
  if (searchBtn) addRippleEffect(searchBtn);
  if (geoBtn) addRippleEffect(geoBtn);
  if (themeToggle) addRippleEffect(themeToggle);

  // Theme Toggle Event Listener
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });

  // Start initial clock based on browser time zone offset
  const browserTimezoneOffsetSeconds = -new Date().getTimezoneOffset() * 60;
  startClock(browserTimezoneOffsetSeconds);

  // Auto-location popup on load, fallback to "New Delhi" if denied/unsupported
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        fetchWeatherData({ lat, lon });
      },
      (error) => {
        fetchWeatherData({ city: "New Delhi" });
      }
    );
  } else {
    fetchWeatherData({ city: "New Delhi" });
  }

  // Handle Search Submission
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = cityInput.value.trim();
    if (query) {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      showDropdown(false);
      showSpinner(false);
      fetchWeatherData({ city: query });
    }
  });

  // Autocomplete suggestions state & logic
  let currentSuggestions = [];
  let selectedSuggestionIndex = -1;
  let abortController = null;

  // Debounce helper
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Helper to convert country code to flag emoji
  function getFlagEmoji(countryCode) {
    if (!countryCode) return '';
    return countryCode
      .toUpperCase()
      .split('')
      .map(char => String.fromCodePoint(0x1F1E6 - 65 + char.charCodeAt(0)))
      .join('');
  }

  function showSpinner(show) {
    if (show) {
      autocompleteSpinner.classList.remove('hidden');
    } else {
      autocompleteSpinner.classList.add('hidden');
    }
  }

  function showDropdown(show) {
    if (show && currentSuggestions.length > 0) {
      autocompleteDropdown.classList.remove('hidden');
      setTimeout(() => {
        autocompleteDropdown.classList.add('show');
      }, 10);
    } else {
      autocompleteDropdown.classList.remove('show');
      setTimeout(() => {
        if (!autocompleteDropdown.classList.contains('show')) {
          autocompleteDropdown.classList.add('hidden');
        }
      }, 250);
    }
  }

  function renderSuggestions(suggestions) {
    currentSuggestions = suggestions.slice(0, 6);
    selectedSuggestionIndex = -1;
    autocompleteDropdown.innerHTML = '';

    if (currentSuggestions.length === 0) {
      showDropdown(false);
      return;
    }

    currentSuggestions.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.setAttribute('data-index', index);

      const textWrapper = document.createElement('div');
      textWrapper.className = 'autocomplete-item-text';

      const cityName = document.createElement('span');
      cityName.className = 'autocomplete-item-city';
      cityName.textContent = item.name;

      const stateName = document.createElement('span');
      stateName.className = 'autocomplete-item-state';
      stateName.textContent = `${item.state ? item.state + ', ' : ''}${item.country}`;

      textWrapper.appendChild(cityName);
      textWrapper.appendChild(stateName);

      const flag = document.createElement('span');
      flag.className = 'autocomplete-item-flag';
      flag.textContent = getFlagEmoji(item.country);

      div.appendChild(textWrapper);
      div.appendChild(flag);

      div.addEventListener('click', () => {
        selectSuggestion(item);
      });

      autocompleteDropdown.appendChild(div);
    });

    showDropdown(true);
  }

  function selectSuggestion(item) {
    cityInput.value = `${item.name}, ${item.country}`;
    showDropdown(false);
    fetchWeatherData({ city: `${item.name}, ${item.country}` });
  }

  function updateActiveSuggestion() {
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((item, idx) => {
      if (idx === selectedSuggestionIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  const handleInput = debounce(async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      currentSuggestions = [];
      showDropdown(false);
      showSpinner(false);
      return;
    }

    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    showSpinner(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
      if (!response.ok) {
        throw new Error('Geocoding suggestions failed');
      }
      const data = await response.json();
      renderSuggestions(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error fetching suggestions:', err);
        showDropdown(false);
      }
    } finally {
      if (abortController && abortController.signal === signal) {
        showSpinner(false);
      }
    }
  }, 300);

  cityInput.addEventListener('input', handleInput);

  cityInput.addEventListener('focus', () => {
    if (cityInput.value.trim().length >= 2 && currentSuggestions.length > 0) {
      showDropdown(true);
    }
  });

  cityInput.addEventListener('keydown', (e) => {
    const isDropdownVisible = !autocompleteDropdown.classList.contains('hidden') && autocompleteDropdown.classList.contains('show');

    if (!isDropdownVisible) {
      if (e.key === 'ArrowDown' && cityInput.value.trim().length >= 2 && currentSuggestions.length > 0) {
        showDropdown(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % currentSuggestions.length;
        updateActiveSuggestion();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
        updateActiveSuggestion();
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < currentSuggestions.length) {
          e.preventDefault();
          selectSuggestion(currentSuggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        showDropdown(false);
        break;
    }
  });

  document.addEventListener('click', (e) => {
    const searchSection = document.querySelector('.search-section');
    if (searchSection && !searchSection.contains(e.target)) {
      showDropdown(false);
    }
  });

  // Handle Geolocation Button
  geoBtn.addEventListener('click', () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    showDropdown(false);
    showSpinner(false);

    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.');
      return;
    }

    // Disable geo button and indicate searching
    const geoText = geoBtn.querySelector('.geo-text');
    const originalText = geoText ? geoText.textContent : 'Locate';
    if (geoText) geoText.textContent = 'Locating...';
    geoBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetchWeatherData({ lat: latitude, lon: longitude })
          .finally(() => {
            if (geoText) geoText.textContent = originalText;
            geoBtn.disabled = false;
          });
      },
      (error) => {
        let msg = 'Unable to retrieve location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Geolocation access denied by user.';
        }
        showToast(msg);
        if (geoText) geoText.textContent = originalText;
        geoBtn.disabled = false;
      },
      { timeout: 10000 }
    );
  });

  // Fetch unified weather and forecast from backend proxy
  async function fetchWeatherData(params) {
    showLoader(true);

    let url = '/api/weather?';
    if (params.city) {
      url += `city=${encodeURIComponent(params.city)}`;
    } else if (params.lat && params.lon) {
      url += `lat=${params.lat}&lon=${params.lon}`;
    }

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch weather');
      }

      updateWeatherUI(data);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Something went wrong. Please check your network or search term.');
    } finally {
      showLoader(false);
    }
  }

  // Update animated weather background gradients and particles
  function updateAnimatedBackground(id) {
    const bgContainer = document.querySelector('.ambient-background');
    const particleContainer = document.getElementById('weather-particles');
    if (!bgContainer || !particleContainer) return;

    // Clear existing particle elements
    particleContainer.innerHTML = '';
    
    // Reset background classes on body and container
    bgContainer.className = 'ambient-background';
    document.body.className = '';

    let weatherClass = '';
    if (id >= 200 && id <= 232) {
      weatherClass = 'bg-thunderstorm';
    } else if (id >= 300 && id <= 321) {
      weatherClass = 'bg-drizzle';
    } else if (id >= 500 && id <= 531) {
      weatherClass = 'bg-rain';
    } else if (id >= 600 && id <= 622) {
      weatherClass = 'bg-snow';
    } else if (id >= 700 && id <= 780) {
      weatherClass = 'bg-mist';
    } else if (id === 781) {
      weatherClass = 'bg-haze';
    } else if (id === 800) {
      weatherClass = 'bg-clear';
    } else if (id >= 801 && id <= 804) {
      weatherClass = 'bg-cloudy';
    } else {
      weatherClass = 'bg-clear'; // Default fallback
    }

    bgContainer.classList.add(weatherClass);
    document.body.classList.add(weatherClass);

    // Generate dynamic weather elements inside #weather-particles
    if (weatherClass === 'bg-clear') {
      // Rotating sun with rays
      const sun = document.createElement('div');
      sun.className = 'sunny-sun';
      const rays = document.createElement('div');
      rays.className = 'sunny-rays';
      sun.appendChild(rays);
      particleContainer.appendChild(sun);

      // Sparkle dots
      for (let i = 0; i < 25; i++) {
        const dot = document.createElement('div');
        dot.className = 'sparkle-dot';
        dot.style.left = `${Math.random() * 100}%`;
        dot.style.top = `${Math.random() * 100}%`;
        dot.style.animationDelay = `${Math.random() * 3}s`;
        dot.style.animationDuration = `${2 + Math.random() * 2}s`;
        particleContainer.appendChild(dot);
      }
    } else if (weatherClass === 'bg-cloudy') {
      // Floating cloud shapes
      for (let i = 0; i < 6; i++) {
        const cloud = document.createElement('div');
        cloud.className = 'cloud-particle';
        const size = 150 + Math.random() * 150;
        cloud.style.width = `${size}px`;
        cloud.style.height = `${size * 0.4}px`;
        cloud.style.top = `${10 + Math.random() * 40}%`;
        cloud.style.left = `-${size}px`;
        cloud.style.animationDelay = `${i * 8}s`;
        cloud.style.animationDuration = `${30 + Math.random() * 25}s`;
        cloud.style.opacity = `${0.15 + Math.random() * 0.2}`;
        particleContainer.appendChild(cloud);
      }
    } else if (weatherClass === 'bg-rain') {
      // Fast falling blue lines
      for (let i = 0; i < 60; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-particle';
        drop.style.left = `${Math.random() * 100}%`;
        drop.style.top = `-${40 + Math.random() * 50}px`;
        drop.style.animationDelay = `${Math.random() * 2}s`;
        drop.style.animationDuration = `${0.6 + Math.random() * 0.5}s`;
        particleContainer.appendChild(drop);
      }
    } else if (weatherClass === 'bg-drizzle') {
      // Slow small falling dots
      for (let i = 0; i < 40; i++) {
        const dot = document.createElement('div');
        dot.className = 'drizzle-particle';
        dot.style.left = `${Math.random() * 100}%`;
        dot.style.top = `-${10 + Math.random() * 30}px`;
        dot.style.animationDelay = `${Math.random() * 3}s`;
        dot.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;
        particleContainer.appendChild(dot);
      }
    } else if (weatherClass === 'bg-thunderstorm') {
      // Lightning overlay
      const lightning = document.createElement('div');
      lightning.className = 'lightning-flash';
      particleContainer.appendChild(lightning);

      // Thunder bolts
      const bolt = document.createElement('div');
      bolt.className = 'thunder-bolt';
      bolt.style.left = `${20 + Math.random() * 60}%`;
      particleContainer.appendChild(bolt);

      // Fast heavy rain
      for (let i = 0; i < 50; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-particle';
        drop.style.left = `${Math.random() * 100}%`;
        drop.style.top = `-${40 + Math.random() * 50}px`;
        drop.style.animationDelay = `${Math.random() * 1.5}s`;
        drop.style.animationDuration = `${0.5 + Math.random() * 0.4}s`;
        particleContainer.appendChild(drop);
      }
    } else if (weatherClass === 'bg-snow') {
      // Rotating white snowflakes drifting down
      for (let i = 0; i < 50; i++) {
        const flake = document.createElement('div');
        flake.className = 'snow-particle';
        const size = 5 + Math.random() * 12;
        flake.style.width = `${size}px`;
        flake.style.height = `${size}px`;
        flake.style.left = `${Math.random() * 100}%`;
        flake.style.top = `-${20 + Math.random() * 20}px`;
        flake.style.animationDelay = `${Math.random() * 6}s`;
        flake.style.animationDuration = `${4 + Math.random() * 5}s`;
        particleContainer.appendChild(flake);
      }
    } else if (weatherClass === 'bg-mist') {
      // Blurry white mist drifting shapes
      for (let i = 0; i < 5; i++) {
        const mist = document.createElement('div');
        mist.className = 'mist-particle';
        const size = 200 + Math.random() * 250;
        mist.style.width = `${size}px`;
        mist.style.height = `${size}px`;
        mist.style.top = `${15 + Math.random() * 50}%`;
        mist.style.left = `-${size}px`;
        mist.style.animationDelay = `${i * 7}s`;
        mist.style.animationDuration = `${25 + Math.random() * 20}s`;
        particleContainer.appendChild(mist);
      }
    } else if (weatherClass === 'bg-haze') {
      // Heat shimmer wave
      const shimmer = document.createElement('div');
      shimmer.className = 'heat-shimmer';
      particleContainer.appendChild(shimmer);
    }
  }

  // Update weather dashboard components
  function updateWeatherUI(data) {
    const current = data.current;
    const forecast = data.forecast;
    const airPollution = data.airPollution;

    // Update animated weather background based on weather condition ID
    const id = current.weather[0].id;
    updateAnimatedBackground(id);

    // Weather emoji next to temp
    const emojiSpan = document.getElementById('temp-emoji');
    if (emojiSpan) {
      emojiSpan.textContent = getWeatherEmoji(id);
    }

    // Current weather details
    locationName.textContent = `${current.name}, ${current.sys.country}`;
    weatherDescription.textContent = current.weather[0].description;
    currentTemp.textContent = Math.round(current.main.temp);
    tempMin.textContent = `${Math.round(current.main.temp_min)}°C`;
    tempMax.textContent = `${Math.round(current.main.temp_max)}°C`;

    // Weather icons using secure official OpenWeatherMap icons
    const iconCode = current.weather[0].icon;
    weatherMainIcon.src = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
    weatherMainIcon.classList.remove('hidden');
    weatherIconPlaceholder.style.display = 'none';

    // Detailed stats
    windSpeed.textContent = `${Math.round(current.wind.speed * 3.6)} km/h`; // m/s to km/h
    windDir.textContent = `Angle: ${current.wind.deg}°`;

    humidity.textContent = `${current.main.humidity}%`;
    humidityDesc.textContent = getHumidityDescription(current.main.humidity);

    pressure.textContent = `${current.main.pressure} hPa`;
    pressureDesc.textContent = getPressureDescription(current.main.pressure);

    feelsLike.textContent = `${Math.round(current.main.feels_like)}°C`;
    const feelsLikeDiffVal = current.main.feels_like - current.main.temp;
    feelsLikeDiff.textContent = Math.abs(feelsLikeDiffVal) < 1
      ? 'Feels identical to actual temp'
      : `${feelsLikeDiffVal > 0 ? 'Warmer' : 'Colder'} by ${Math.abs(Math.round(feelsLikeDiffVal))}°C`;

    // Sunrise & Sunset calculations
    sunrise.textContent = formatTimestampToLocalTime(current.sys.sunrise, current.timezone);
    sunset.textContent = formatTimestampToLocalTime(current.sys.sunset, current.timezone);

    sunriseTimeTo.textContent = getRemainingTimeText(current.sys.sunrise, current.timezone);
    sunsetTimeTo.textContent = getRemainingTimeText(current.sys.sunset, current.timezone);

    // 1. Estimated UV Index
    const isDay = current.dt > current.sys.sunrise && current.dt < current.sys.sunset;
    let uvIndex = 0;
    if (isDay) {
      const latFact = Math.max(0, 1 - Math.abs(current.coord.lat) / 90);
      const cloudFact = 1 - (current.clouds.all / 100) * 0.7;
      const totalDay = current.sys.sunset - current.sys.sunrise;
      const curSecs = current.dt - current.sys.sunrise;
      const timeFact = Math.max(0, Math.sin((curSecs / totalDay) * Math.PI));
      uvIndex = Math.round(11 * latFact * cloudFact * timeFact * 10) / 10;
    }
    const uvSpan = document.getElementById('uv-index');
    const uvDescSpan = document.getElementById('uv-desc');
    if (uvSpan && uvDescSpan) {
      uvSpan.textContent = uvIndex;
      if (uvIndex <= 2) uvDescSpan.textContent = 'Low (Safe)';
      else if (uvIndex <= 5) uvDescSpan.textContent = 'Moderate';
      else if (uvIndex <= 7) uvDescSpan.textContent = 'High (Risk)';
      else if (uvIndex <= 10) uvDescSpan.textContent = 'Very High';
      else uvDescSpan.textContent = 'Extreme danger';
    }

    // 2. Visibility Card
    const visibilitySpan = document.getElementById('visibility');
    const visibilityDescSpan = document.getElementById('visibility-desc');
    if (visibilitySpan && visibilityDescSpan) {
      const visKm = (current.visibility / 1000).toFixed(1);
      visibilitySpan.textContent = `${visKm} km`;
      if (visKm > 8) visibilityDescSpan.textContent = 'Clear view';
      else if (visKm > 3) visibilityDescSpan.textContent = 'Moderate haze';
      else visibilityDescSpan.textContent = 'Foggy / low visibility';
    }

    // 3. Air Quality Indicator Card
    const aqiLevelSpan = document.getElementById('aqi-level');
    const aqiDescSpan = document.getElementById('aqi-desc');
    let aqi = 2; // default Fair
    if (airPollution && airPollution.list && airPollution.list[0]) {
      aqi = airPollution.list[0].main.aqi;
    }
    if (aqiLevelSpan && aqiDescSpan) {
      const aqiLabels = {
        1: 'Good',
        2: 'Fair',
        3: 'Moderate',
        4: 'Poor',
        5: 'Very Poor'
      };
      aqiLevelSpan.textContent = `${aqi}/5`;
      aqiDescSpan.textContent = aqiLabels[aqi] || 'Moderate';
    }

    // 4. Dew Point Card
    const dewPointSpan = document.getElementById('dew-point');
    const dewPointDescSpan = document.getElementById('dew-point-desc');
    if (dewPointSpan && dewPointDescSpan) {
      const tempC = current.main.temp;
      const rh = current.main.humidity;
      const a = 17.625;
      const b = 243.04;
      const alpha = ((a * tempC) / (b + tempC)) + Math.log(rh / 100);
      const dewVal = (b * alpha) / (a - alpha);
      dewPointSpan.textContent = `${Math.round(dewVal)} °C`;
      if (dewVal < 10) dewPointDescSpan.textContent = 'Dry & Crisp';
      else if (dewVal <= 16) dewPointDescSpan.textContent = 'Comfortable';
      else if (dewVal <= 20) dewPointDescSpan.textContent = 'Sticky';
      else dewPointDescSpan.textContent = 'Highly humid';
    }

    // 5. Cloud Coverage Card
    const cloudsSpan = document.getElementById('cloud-coverage');
    const cloudsDescSpan = document.getElementById('cloud-coverage-desc');
    if (cloudsSpan && cloudsDescSpan) {
      const cloudPct = current.clouds.all;
      cloudsSpan.textContent = `${cloudPct}%`;
      if (cloudPct < 10) cloudsDescSpan.textContent = 'Clear Skies';
      else if (cloudPct <= 50) cloudsDescSpan.textContent = 'Partly Cloudy';
      else if (cloudPct <= 85) cloudsDescSpan.textContent = 'Mostly Cloudy';
      else cloudsDescSpan.textContent = 'Overcast';
    }

    // 6. Detailed Outlook paragraph
    const outlookSpan = document.getElementById('weather-detail-paragraph');
    if (outlookSpan) {
      const tempC = current.main.temp;
      const rh = current.main.humidity;
      const a = 17.625;
      const b = 243.04;
      const alpha = ((a * tempC) / (b + tempC)) + Math.log(rh / 100);
      const dewVal = (b * alpha) / (a - alpha);
      outlookSpan.textContent = `Today in ${current.name}, expect ${current.weather[0].description} conditions. Current temperature is ${Math.round(current.main.temp)}°C (feels like ${Math.round(current.main.feels_like)}°C). Winds blow at ${Math.round(current.wind.speed * 3.6)} km/h with humidity at ${current.main.humidity}% and a dew point of ${Math.round(dewVal)}°C.`;
    }

    // 7. Activity Outdoor Suggestion
    const suggestionSpan = document.getElementById('outdoor-suggestion');
    if (suggestionSpan) {
      const weatherId = current.weather[0].id;
      if (weatherId < 600) {
        suggestionSpan.textContent = '⚠️ Rain or storms expected. Indoor activities recommended.';
      } else if (aqi >= 4) {
        suggestionSpan.textContent = '⚠️ High pollution levels. Limit outdoor exposure.';
      } else if (current.main.temp > 35) {
        suggestionSpan.textContent = '⚠️ Excessive heat. Avoid midday sun, head out early morning.';
      } else if (current.main.temp < 10) {
        suggestionSpan.textContent = '❄️ Cold day. Best outside between 12 PM - 2 PM with warm layers.';
      } else {
        suggestionSpan.textContent = '✨ Beautiful day! Perfect time for outdoor walks, exercise or sports.';
      }
    }

    // 8. Hourly Temperature Trend CSS Chart
    renderHourlyCSSChart(forecast.list);

    // Live clock timezone alignment
    startClock(current.timezone);

    // 5-Day Forecast rendering
    renderForecast(forecast.list);
  }

  // Helper for weather emoji
  function getWeatherEmoji(id) {
    if (id === 800) return '☀️';
    if (id >= 801 && id <= 804) return '☁️';
    if (id >= 500 && id <= 531) return '🌧️';
    if (id >= 300 && id <= 321) return '🌦️';
    if (id >= 200 && id <= 232) return '⛈️';
    if (id >= 600 && id <= 622) return '❄️';
    if (id >= 701 && id <= 781) return '🌫️';
    return '🌡️';
  }

  // Helper for weather category mapping
  function getWeatherClass(id) {
    if (id >= 200 && id <= 232) return 'thunderstorm';
    if (id >= 300 && id <= 321) return 'drizzle';
    if (id >= 500 && id <= 531) return 'rain';
    if (id >= 600 && id <= 622) return 'snow';
    if (id >= 700 && id <= 780) return 'mist';
    if (id === 781) return 'haze';
    if (id === 800) return 'clear';
    if (id >= 801 && id <= 804) return 'cloudy';
    return 'clear';
  }

  // Renders a pure CSS bar chart for the first 8 forecast periods (next 24 hours)
  function renderHourlyCSSChart(list) {
    const container = document.getElementById('hourly-chart-container');
    if (!container) return;
    container.innerHTML = '';

    const hourlyList = list.slice(0, 8); // next 24 hours
    const temps = hourlyList.map(h => h.main.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const range = max - min || 1;

    hourlyList.forEach(item => {
      const tempVal = Math.round(item.main.temp);
      const timeDate = new Date(item.dt * 1000);
      let hr = timeDate.getHours();
      const ampm = hr >= 12 ? 'PM' : 'AM';
      hr = hr % 12 || 12;
      const timeLabel = `${hr} ${ampm}`;

      // Calculate relative height from 10% to 90%
      const heightPercent = ((item.main.temp - min) / range) * 60 + 20;

      const column = document.createElement('div');
      column.className = 'chart-column';
      column.innerHTML = `
        <span class="chart-temp-val">${tempVal}°</span>
        <div class="chart-bar-container">
          <div class="chart-bar-fill" style="height: ${heightPercent}%;"></div>
        </div>
        <img class="chart-icon-val" src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" alt="${item.weather[0].description}">
        <span class="chart-time-val">${timeLabel}</span>
      `;
      container.appendChild(column);
    });
  }

  // Display daily forecast cards
  function renderForecast(forecastList) {
    forecastContainer.innerHTML = '';

    // Group all items by date
    const grouped = {};
    forecastList.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric'
        });
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(item);
    });

    // Find absolute min/max temperatures for range bar alignment
    let absMin = Infinity;
    let absMax = -Infinity;
    Object.values(grouped).forEach(items => {
        items.forEach(i => {
            if (i.main.temp < absMin) absMin = i.main.temp;
            if (i.main.temp > absMax) absMax = i.main.temp;
        });
    });

    Object.entries(grouped).forEach(([dateKey, items], index) => {
        const temps = items.map(i => i.main.temp);
        const minTemp = Math.round(Math.min(...temps));
        const maxTemp = Math.round(Math.max(...temps));
        const midItem = items[Math.floor(items.length / 2)];
        const icon = midItem.weather[0].icon;
        const desc = midItem.weather[0].description;
        const weatherId = midItem.weather[0].id;
        const humidityVal = midItem.main.humidity;
        const windVal = Math.round(midItem.wind.speed * 3.6);
        const dayId = `day-${index}`;

        // Compute temperature range bar bounds
        const rangeSpan = absMax - absMin || 1;
        const leftPct = ((minTemp - absMin) / rangeSpan) * 100;
        const widthPct = ((maxTemp - minTemp) / rangeSpan) * 100;

        const card = document.createElement('div');
        card.className = `card forecast-card forecast-card-loaded border-${getWeatherClass(weatherId)}`;
        card.style.animationDelay = `${index * 0.12}s`;
        card.innerHTML = `
            <div class="day-header" onclick="toggleHourly('${dayId}')">
                <div class="forecast-main-info">
                    <span class="forecast-day">${dateKey.split(',')[0]}</span>
                    <span class="forecast-date">${dateKey.split(',').slice(1).join(',').trim()}</span>
                </div>
                <div class="forecast-status">
                    <img class="forecast-icon" src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${desc}">
                    <span class="forecast-desc" title="${desc}">${desc}</span>
                </div>
                <div class="forecast-temp-container">
                    <span class="forecast-min">${minTemp}°</span>
                    <div class="temp-bar-bg">
                        <div class="temp-bar-fill" style="left: ${leftPct}%; width: ${widthPct}%;"></div>
                    </div>
                    <span class="forecast-max">${maxTemp}°</span>
                </div>
                <div class="forecast-extra-details">
                    <span class="forecast-extra-item">💧 ${humidityVal}%</span>
                    <span class="forecast-extra-item">💨 ${windVal}km/h</span>
                </div>
                <span class="expand-arrow">▼</span>
            </div>
            <div class="hourly-grid" id="${dayId}" style="display:none;">
                ${items.map(item => {
                    const t = new Date(item.dt * 1000);
                    const hours = t.getHours();
                    const mins = String(t.getMinutes()).padStart(2, '0');
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    const h = hours % 12 || 12;
                    const timeStr = `${h}:${mins} ${ampm}`;
                    return `
                        <div class="hourly-item">
                            <div class="h-time">${timeStr}</div>
                            <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png"
                                 alt="${item.weather[0].description}"
                                 style="width:32px;height:32px;">
                            <div class="h-temp">${Math.round(item.main.temp)}°C</div>
                            <div class="h-feel">Feels ${Math.round(item.main.feels_like)}°</div>
                            <div class="h-humid">💧 ${item.main.humidity}%</div>
                            <div class="h-wind">💨 ${Math.round(item.wind.speed * 3.6)}km/h</div>
                            <div class="h-desc">${item.weather[0].description}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        forecastContainer.appendChild(card);
    });
  }

  // Live Clock calculation
  function startClock(timezoneOffsetSeconds) {
    currentCityTimezoneOffset = timezoneOffsetSeconds;

    if (clockIntervalId) {
      clearInterval(clockIntervalId);
    }

    updateClockDisplay();
    clockIntervalId = setInterval(updateClockDisplay, 1000);
  }

  function updateClockDisplay() {
    // Current UTC time
    const now = new Date();
    const utcTimeMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const targetCityTime = new Date(utcTimeMs + (currentCityTimezoneOffset * 1000));

    const hours = String(targetCityTime.getHours()).padStart(2, '0');
    const minutes = String(targetCityTime.getMinutes()).padStart(2, '0');
    const seconds = String(targetCityTime.getSeconds()).padStart(2, '0');

    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    const dateString = targetCityTime.toLocaleDateString('en-US', options);

    document.getElementById('live-time').textContent = `${hours}:${minutes}:${seconds}`;
    document.getElementById('live-date').textContent = dateString;
  }

  // Formats UTC UNIX timestamp into local city timezone HH:MM format
  function formatTimestampToLocalTime(timestamp, timezoneOffsetSeconds) {
    const date = new Date((timestamp) * 1000);
    const utcTimeMs = date.getTime() + (new Date().getTimezoneOffset() * 60000);
    const localTime = new Date(utcTimeMs + (timezoneOffsetSeconds * 1000));

    let hours = localTime.getHours();
    const minutes = String(localTime.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    return `${hours}:${minutes} ${ampm}`;
  }

  // Generates countdown/elapsed human text for Sunrise and Sunset relative to target city local time
  function getRemainingTimeText(timestamp, timezoneOffsetSeconds) {
    const now = new Date();
    const currentUtcTimeMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const currentCityTimeMs = currentUtcTimeMs + (timezoneOffsetSeconds * 1000);

    const targetUtcTimeMs = (timestamp * 1000);
    const diffMs = targetUtcTimeMs - (now.getTime());

    const diffMin = Math.round(diffMs / 60000);

    if (diffMin > 0) {
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      return hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins}m`;
    } else {
      const absMin = Math.abs(diffMin);
      const hours = Math.floor(absMin / 60);
      const mins = absMin % 60;
      return hours > 0 ? `${hours}h ${mins}m ago` : `${mins}m ago`;
    }
  }

  // Display Helper functions
  function getHumidityDescription(h) {
    if (h < 30) return 'Too dry, uncomfortable';
    if (h >= 30 && h <= 60) return 'Optimal comfort range';
    if (h > 60 && h <= 80) return 'High moisture levels';
    return 'Extremely damp air';
  }

  function getPressureDescription(p) {
    if (p < 1009) return 'Low pressure (Storm potential)';
    if (p >= 1009 && p <= 1020) return 'Normal atmospheric levels';
    return 'High pressure (Clear conditions)';
  }

  function showLoader(show) {
    if (show) {
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  }

  // Toast System
  function showToast(message) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';

    toast.innerHTML = `
      <div class="toast-content">
        <svg class="toast-error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${message}</span>
      </div>
      <button class="toast-close-btn" aria-label="Dismiss">
        <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    // Toast close click
    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    });

    toastContainer.appendChild(toast);

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 400);
      }
    }, 6000);
  }
});

function toggleHourly(dayId) {
    const grid = document.getElementById(dayId);
    const allGrids = document.querySelectorAll('.hourly-grid');
    const allArrows = document.querySelectorAll('.expand-arrow');
    const isOpen = grid.style.display !== 'none';
    allGrids.forEach(g => g.style.display = 'none');
    allArrows.forEach(a => a.textContent = '▼');
    if (!isOpen) {
        grid.style.display = 'grid';
        grid.previousElementSibling.querySelector('.expand-arrow').textContent = '▲';
    }
}
