/* --------------------------------------------------
 * SkyFlow Client Logic
 * -------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const themeToggle = document.getElementById('theme-toggle');
  const searchForm = document.getElementById('search-form');
  const cityInput = document.getElementById('city-input');
  const geoBtn = document.getElementById('geo-btn');
  const loader = document.getElementById('loader');

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

  // Default City to load on first startup
  const defaultCity = 'London';
  fetchWeatherData({ city: defaultCity });

  // Handle Search Submission
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = cityInput.value.trim();
    if (query) {
      fetchWeatherData({ city: query });
    }
  });

  // Handle Geolocation Button
  geoBtn.addEventListener('click', () => {
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

  // Update weather dashboard components
  function updateWeatherUI(data) {
    const current = data.current;
    const forecast = data.forecast;

    // Dynamic body backgrounds based on weather ID group
    // 2xx Thunderstorm, 3xx Drizzle, 5xx Rain, 6xx Snow, 7xx Atmosphere (Fog, Mist), 800 Clear, 80x Clouds
    const id = current.weather[0].id;
    document.body.className = ''; // reset classes
    if (id >= 200 && id < 600) {
      document.body.classList.add('weather-rain');
    } else if (id >= 600 && id < 700) {
      document.body.classList.add('weather-snow');
    } else if (id >= 801 && id <= 804) {
      document.body.classList.add('weather-clouds');
    } else {
      document.body.classList.add('weather-clear');
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
    // Times are relative to city location. 
    // Show local time format of target city timezone offset
    sunrise.textContent = formatTimestampToLocalTime(current.sys.sunrise, current.timezone);
    sunset.textContent = formatTimestampToLocalTime(current.sys.sunset, current.timezone);

    // Time difference messages
    sunriseTimeTo.textContent = getRemainingTimeText(current.sys.sunrise, current.timezone);
    sunsetTimeTo.textContent = getRemainingTimeText(current.sys.sunset, current.timezone);

    // Live clock timezone alignment
    startClock(current.timezone);

    // 5-Day Forecast rendering
    renderForecast(forecast.list);
  }

  // Display daily forecast cards
  function renderForecast(forecastList) {
    forecastContainer.innerHTML = '';
    const aggregated = aggregateForecast(forecastList);

    aggregated.forEach(day => {
      const card = document.createElement('div');
      card.className = 'card forecast-card';
      card.innerHTML = `
        <span class="forecast-day">${day.dayName}</span>
        <span class="forecast-date">${day.dateStr}</span>
        <img class="forecast-icon" src="https://openweathermap.org/img/wn/${day.icon}@2x.png" alt="${day.description}">
        <span class="forecast-desc" title="${day.description}">${day.description}</span>
        <div class="forecast-temp">
          <span class="forecast-max">${day.tempMax}°</span>
          <span class="forecast-min">${day.tempMin}°</span>
        </div>
      `;
      forecastContainer.appendChild(card);
    });
  }

  // Aggregate 3-hour forecasts to 5-day forecasts
  function aggregateForecast(list) {
    const grouped = {};

    list.forEach(item => {
      // Date key string "YYYY-MM-DD"
      const datePart = item.dt_txt.split(' ')[0];
      if (!grouped[datePart]) {
        grouped[datePart] = [];
      }
      grouped[datePart].push(item);
    });

    const dailyForecasts = [];
    const dates = Object.keys(grouped).sort();

    // Standardize representation of 5 unique upcoming days
    const datesToUse = dates.slice(0, 5);

    datesToUse.forEach(dateStr => {
      const dayData = grouped[dateStr];

      let minTemp = Infinity;
      let maxTemp = -Infinity;

      dayData.forEach(item => {
        if (item.main.temp_min < minTemp) minTemp = item.main.temp_min;
        if (item.main.temp_max > maxTemp) maxTemp = item.main.temp_max;
      });

      // Look for midday report (12:00:00), fallback to middle item of dataset
      let noonInterval = dayData.find(item => item.dt_txt.includes('12:00:00'));
      if (!noonInterval) {
        noonInterval = dayData[Math.floor(dayData.length / 2)];
      }

      const dateObj = new Date(noonInterval.dt * 1000);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      dailyForecasts.push({
        dayName,
        dateStr: formattedDate,
        tempMin: Math.round(minTemp),
        tempMax: Math.round(maxTemp),
        icon: noonInterval.weather[0].icon,
        description: noonInterval.weather[0].description
      });
    });

    return dailyForecasts;
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
// AUTO LOCATION ON PAGE LOAD
window.addEventListener('load', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        // Call your existing weather by coords function
        fetchWeatherByCoords(lat, lon);
      },
      (error) => {
        // If user denies, show default city
        fetchWeatherByCity("New Delhi");
      }
    );
  }
});
