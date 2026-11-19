async function testConnection() {
  const modulesData = await getModules();
  const eventsData = await getEvents(5);
  console.log(modulesData);
  console.log(eventsData);
}

testConnection();