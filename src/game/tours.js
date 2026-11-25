import { DATA } from '../data.js';
import { GS } from '../state.js';
import { DRIVER_REST_RESET_MINUTES } from '../constants.js';
import { findShortestPath, routeDistance } from '../routing.js';
import { getDriverByVehicle, getDriverDailyLimit, getDriverPerformanceFactor } from './staff.js';
import { getVehicleConditionFactor } from './vehicles.js';

function pathDistance(fromCity, toCity) {
  return routeDistance(findShortestPath(fromCity, toCity).map(cityId => ({ cityId })));
}

export function getDriverShiftState(driver, atMinute = GS.time.totalMinutes) {
  const limit = getDriverDailyLimit(driver);
  const restUntilMinute = Number.isFinite(driver?.restUntilMinute) ? driver.restUntilMinute : null;
  const resting = restUntilMinute !== null && restUntilMinute > atMinute;
  const remaining = resting
    ? limit
    : Math.max(0, limit - (driver?.drivingMinutesToday || 0));
  return {
    limit,
    remaining,
    used: resting ? 0 : Math.max(0, limit - remaining),
    resting,
    restUntilMinute,
    availableMinute: resting ? restUntilMinute : atMinute,
  };
}

export function projectDrivingSegments(driver, startMinute, drivingMinutes) {
  const limit = getDriverDailyLimit(driver);
  if (limit <= 0) {
    return {
      endMinute: startMinute + Math.max(0, drivingMinutes),
      drivingMinutes: Math.max(0, drivingMinutes),
      remainingDrivingMinutes: 0,
      rests: [],
    };
  }
  let cursor = startMinute;
  let todo = Math.max(0, drivingMinutes);
  let used = driver?.drivingMinutesToday || 0;
  const rests = [];

  if (Number.isFinite(driver?.restUntilMinute) && driver.restUntilMinute > cursor) {
    rests.push({
      startMinute: cursor,
      endMinute: driver.restUntilMinute,
      duration: driver.restUntilMinute - cursor,
    });
    cursor = driver.restUntilMinute;
    used = 0;
  }

  while (todo > 0) {
    let available = Math.max(0, limit - used);
    if (available <= 0) {
      const restEnd = cursor + DRIVER_REST_RESET_MINUTES;
      rests.push({ startMinute: cursor, endMinute: restEnd, duration: DRIVER_REST_RESET_MINUTES });
      cursor = restEnd;
      used = 0;
      available = limit;
    }
    const segment = Math.min(todo, available);
    cursor += segment;
    todo -= segment;
    used += segment;

    if (todo > 0 && used >= limit) {
      const restEnd = cursor + DRIVER_REST_RESET_MINUTES;
      rests.push({ startMinute: cursor, endMinute: restEnd, duration: DRIVER_REST_RESET_MINUTES });
      cursor = restEnd;
      used = 0;
    }
  }

  return {
    endMinute: cursor,
    drivingMinutes: Math.max(0, drivingMinutes),
    remainingDrivingMinutes: Math.max(0, limit - used),
    rests,
  };
}

export function projectTour(vehicle, orders, returnToBase = false, startMinute = GS.time.totalMinutes) {
  const catalog = DATA.VEHICLES.find(item => item.id === vehicle.catalogId);
  if (!catalog) return null;
  const driver = getDriverByVehicle(vehicle);
  if (!driver) return null;

  const speed = catalog.speed
    * GS.market.speedMod
    * getVehicleConditionFactor(vehicle)
    * getDriverPerformanceFactor(driver);
  const kmPerMinute = speed / 60;
  const limit = getDriverDailyLimit(driver);
  let cursor = startMinute;
  let currentCity = vehicle.currentCity || vehicle.homeCity;
  let usedShiftMinutes = driver.drivingMinutesToday || 0;
  let loadedKm = 0;
  let emptyKm = 0;
  let revenue = 0;
  const rests = [];
  const stops = [];

  function move(distance) {
    const before = cursor;
    const drivingMinutes = distance / kmPerMinute;
    const projection = projectDrivingSegments(
      { ...driver, drivingMinutesToday: usedShiftMinutes, restUntilMinute: before },
      before,
      drivingMinutes
    );
    cursor = projection.endMinute;
    usedShiftMinutes = limit - projection.remainingDrivingMinutes;
    rests.push(...projection.rests);
    return cursor;
  }

  if (Number.isFinite(driver.restUntilMinute) && driver.restUntilMinute > cursor) {
    rests.push({
      startMinute: cursor,
      endMinute: driver.restUntilMinute,
      duration: driver.restUntilMinute - cursor,
    });
    cursor = driver.restUntilMinute;
    usedShiftMinutes = 0;
  }

  for (const order of orders) {
    const approachKm = pathDistance(currentCity, order.origin);
    emptyKm += approachKm;
    const pickupMinute = move(approachKm);

    const loadedLegKm = pathDistance(order.origin, order.destination);
    loadedKm += loadedLegKm;
    const deliveryMinute = move(loadedLegKm);
    const deadlineMinute = order.receivedMinute + order.deadlineDays * 1440;
    const marginMinutes = deadlineMinute - deliveryMinute;
    const status = marginMinutes < 0 ? 'late' : marginMinutes < 120 ? 'tight' : 'safe';

    revenue += order.value + (order.bonus || 0);
    stops.push({
      order,
      pickupMinute,
      deliveryMinute,
      deadlineMinute,
      marginMinutes,
      status,
    });
    currentCity = order.destination;
  }

  if (returnToBase) {
    const returnKm = pathDistance(currentCity, vehicle.homeCity);
    emptyKm += returnKm;
    move(returnKm);
    currentCity = vehicle.homeCity;
  }

  const totalKm = loadedKm + emptyKm;
  const fuelCost = totalKm / 100 * catalog.fuelConsumption * GS.market.fuelPrice;
  const remainingDrivingMinutes = Math.max(0, limit - usedShiftMinutes);
  const postTourRestMinutes = remainingDrivingMinutes <= 0 ? DRIVER_REST_RESET_MINUTES : 0;
  return {
    vehicle,
    driver,
    startMinute,
    endMinute: cursor,
    availableMinute: cursor + postTourRestMinutes,
    finalCity: currentCity,
    loadedKm,
    emptyKm,
    totalKm,
    revenue,
    fuelCost,
    projectedProfit: revenue - fuelCost,
    utilization: totalKm > 0 ? Math.round(loadedKm / totalKm * 100) : 100,
    durationMinutes: Math.ceil(cursor - startMinute),
    drivingMinutes: Math.ceil(totalKm / kmPerMinute),
    remainingDrivingMinutes,
    postTourRestMinutes,
    rests,
    stops,
    hasDeadlineRisk: stops.some(stop => stop.status !== 'safe'),
  };
}
