// Questions of the day for the classroom board. One a day, the same for the
// whole class, chosen by the date so tomorrow brings a new one.
export const QUESTIONS = [
  { q: 'Why is the sky blue?', a: 'Sunlight has every color in it. Air bounces blue light around the most, so blue comes at us from all over the sky.', qEs: "¿Por qué el cielo es azul?", aEs: "La luz del Sol tiene todos los colores. El aire desvía más la luz azul, así que el azul nos llega desde todo el cielo." },
  { q: 'Where does rain come from?', a: 'Water dries up (evaporates) from oceans, lakes and plants. High up it cools into tiny cloud drops, and when they bump together and get heavy, they fall as rain.', qEs: "¿De dónde viene la lluvia?", aEs: "El agua se evapora de los mares, lagos y plantas. Allá arriba se enfría y forma gotitas de nube; cuando chocan y se hacen pesadas, caen como lluvia." },
  { q: 'Why do we hear thunder after we see lightning?', a: 'Light is super fast and sound is slow. Count the seconds between flash and boom, then divide by 5 for miles away.', qEs: "¿Por qué oímos el trueno después de ver el rayo?", aEs: "La luz es rapidísima y el sonido es lento. Cuenta los segundos entre el destello y el trueno y divide entre 3 para saber a cuántos kilómetros está." },
  { q: 'Is every snowflake different?', a: 'Almost certainly! Each flake takes its own path through the cloud, growing in slightly different cold and wet air.', qEs: "¿Todos los copos de nieve son diferentes?", aEs: "¡Casi seguro que sí! Cada copo recorre su propio camino dentro de la nube y crece con aire un poquito distinto." },
  { q: 'What is wind?', a: 'Air moving from where the pressure is high to where it is low, like air rushing out of a balloon.', qEs: "¿Qué es el viento?", aEs: "Aire que se mueve de donde la presión es alta a donde es baja, como el aire que sale de un globo." },
  { q: 'Why are clouds white but storm clouds dark?', a: 'Thin clouds let sunlight scatter through them. Thick storm clouds are so full of water that little light makes it to the bottom.', qEs: "¿Por qué las nubes son blancas pero las de tormenta son oscuras?", aEs: "Las nubes delgadas dejan pasar la luz del Sol. Las de tormenta tienen tanta agua que poca luz llega hasta abajo." },
  { q: 'What makes a rainbow?', a: 'Sunlight going into raindrops bends and splits into colors. You see one when the Sun is behind you and rain is in front.', qEs: "¿Cómo se forma un arcoíris?", aEs: "La luz del Sol entra en las gotas de lluvia, se dobla y se separa en colores. Lo ves cuando el Sol está detrás de ti y la lluvia enfrente." },
  { q: 'How does a thermometer work?', a: 'The liquid or the electronics inside change when they warm up or cool down, and that change is turned into a number.', qEs: "¿Cómo funciona un termómetro?", aEs: "El líquido o la electrónica que tiene adentro cambia cuando se calienta o se enfría, y ese cambio se convierte en un número." },
  { q: 'What is fog?', a: 'A cloud that sits on the ground. You are walking through it!', qEs: "¿Qué es la niebla?", aEs: "Una nube que está pegada al suelo. ¡Caminas dentro de ella!" },
  { q: 'Why is it colder on a mountain top?', a: 'Air spreads out and cools as it rises, so higher up is usually colder, even closer to the Sun.', qEs: "¿Por qué hace más frío en la cima de una montaña?", aEs: "El aire se expande y se enfría al subir, así que más arriba suele hacer más frío, aunque estés más cerca del Sol." },
  { q: 'What is humidity?', a: 'How much water vapor is in the air. High humidity feels sticky because sweat dries more slowly.', qEs: "¿Qué es la humedad?", aEs: "Cuánto vapor de agua hay en el aire. Con mucha humedad se siente pegajoso porque el sudor se seca más despacio." },
  { q: 'What is hail?', a: 'Balls of ice made in strong thunderstorms. Winds toss raindrops up into freezing air again and again, adding layers like an onion.', qEs: "¿Qué es el granizo?", aEs: "Bolitas de hielo que se forman en tormentas fuertes. El viento sube las gotas una y otra vez al aire helado y les añade capas, como a una cebolla." },
  { q: 'How do meteorologists know what the weather will do?', a: 'They measure the air all over the world, then supercomputers use the rules of physics to work out what happens next.', qEs: "¿Cómo saben los meteorólogos qué tiempo hará?", aEs: "Miden el aire en todo el mundo y unas supercomputadoras usan las leyes de la física para calcular qué pasará después." },
  { q: 'What is a tornado?', a: 'A spinning column of air reaching from a thunderstorm down to the ground. It is one of the strongest winds on Earth.', qEs: "¿Qué es un tornado?", aEs: "Una columna de aire que gira desde una tormenta hasta el suelo. Tiene algunos de los vientos más fuertes de la Tierra." },
  { q: 'Why do we have seasons?', a: 'Earth is tilted. For part of the year our half leans toward the Sun and gets more direct sunlight. That is summer!', qEs: "¿Por qué hay estaciones del año?", aEs: "La Tierra está inclinada. Parte del año nuestra mitad se inclina hacia el Sol y recibe luz más directa. ¡Eso es el verano!" },
  { q: 'What is dew?', a: 'Water drops that form on cool grass overnight, when the air cools so much it cannot hold all its water vapor.', qEs: "¿Qué es el rocío?", aEs: "Gotas de agua que se forman en el pasto frío durante la noche, cuando el aire se enfría tanto que no puede guardar todo su vapor." },
  { q: 'What is a hurricane?', a: 'A giant spinning storm that forms over warm ocean water, with strong winds and lots of rain.', qEs: "¿Qué es un huracán?", aEs: "Una tormenta gigante que gira y se forma sobre el mar caliente, con vientos fuertes y mucha lluvia." },
  { q: 'Why does the wind chill make it feel colder?', a: 'Wind blows away the thin layer of warm air around your skin, so you lose heat faster.', qEs: "¿Por qué el viento hace que se sienta más frío?", aEs: "El viento se lleva la capita de aire tibio que rodea tu piel, así que pierdes calor más rápido." },
  { q: 'Can it be too cold to snow?', a: 'Not really, but very cold air holds little water, so the biggest snows usually come when it is just below freezing.', qEs: "¿Puede hacer demasiado frío para nevar?", aEs: "No del todo, pero el aire muy frío lleva poca agua, así que las nevadas más grandes suelen llegar cuando está apenas bajo cero." },
  { q: 'What is air pressure?', a: 'The weight of all the air above us pressing down. Falling pressure often means clouds and rain are coming.', qEs: "¿Qué es la presión del aire?", aEs: "El peso de todo el aire que tenemos encima. Cuando la presión baja, a menudo vienen nubes y lluvia." },
  { q: 'Where does lightning come from?', a: 'Ice and water bump around in a storm cloud and build up electric charge, like rubbing a balloon on your hair, but way bigger!', qEs: "¿De dónde salen los rayos?", aEs: "El hielo y el agua chocan dentro de la nube y acumulan carga eléctrica, como cuando frotas un globo en tu pelo, ¡pero mucho más grande!" },
  { q: 'What is a drought?', a: 'A long time with much less rain than usual. Plants, rivers and farms run short of water.', qEs: "¿Qué es una sequía?", aEs: "Mucho tiempo con mucha menos lluvia de lo normal. A las plantas, los ríos y las granjas les falta agua." },
  { q: 'What is El Niño?', a: 'A time when the Pacific Ocean near the equator is warmer than usual. It can change weather around the whole world.', qEs: "¿Qué es El Niño?", aEs: "Una época en la que el océano Pacífico cerca del ecuador está más caliente de lo normal. Puede cambiar el tiempo en todo el mundo." },
  { q: 'Why are some clouds puffy and some flat?', a: 'Puffy clouds grow when warm air bubbles up. Flat, layered clouds form when a whole sheet of air is lifted slowly.', qEs: "¿Por qué unas nubes son esponjosas y otras planas?", aEs: "Las esponjosas crecen cuando burbujas de aire caliente suben. Las planas se forman cuando una capa entera de aire sube despacio." },
  { q: 'What does a weather radar see?', a: 'It sends out pulses of radio waves that bounce off rain, snow and hail, so it can see where they are and how heavy.', qEs: "¿Qué ve un radar meteorológico?", aEs: "Envía pulsos de ondas de radio que rebotan en la lluvia, la nieve y el granizo, así ve dónde están y qué tan fuertes son." },
  { q: 'Why does sleet bounce?', a: 'Sleet is frozen raindrops: little ice pellets. Snow is soft crystals, but sleet is hard ice.', qEs: "¿Por qué rebota el aguanieve?", aEs: "El aguanieve son gotas de lluvia congeladas: bolitas de hielo. La nieve son cristales suaves, pero el aguanieve es hielo duro." },
  { q: 'What is the hottest temperature ever measured?', a: '134 °F (56.7 °C) in Death Valley, California, in 1913.', qEs: "¿Cuál es la temperatura más alta jamás medida?", aEs: "56.7 °C (134 °F) en el Valle de la Muerte, California, en 1913." },
  { q: 'What is the coldest temperature ever measured?', a: 'About −128.6 °F (−89.2 °C) at Vostok Station in Antarctica, in 1983.', qEs: "¿Cuál es la temperatura más baja jamás medida?", aEs: "Unos −89.2 °C (−128.6 °F) en la estación Vostok, en la Antártida, en 1983." },
  { q: 'What is a front?', a: 'The edge between two big blobs of air, one warmer and one colder. Fronts often bring clouds, rain and a change in temperature.', qEs: "¿Qué es un frente?", aEs: "El borde entre dos grandes masas de aire, una más caliente y otra más fría. Los frentes suelen traer nubes, lluvia y cambios de temperatura." },
  { q: 'Why does the Sun look red at sunset?', a: 'At sunset its light passes through much more air. The blue gets scattered away and the reds and oranges get through.', qEs: "¿Por qué el Sol se ve rojo al atardecer?", aEs: "Al atardecer su luz cruza mucho más aire. El azul se dispersa y pasan los rojos y naranjas." },
];

export function questionFor(date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000);
  return QUESTIONS[day % QUESTIONS.length];
}

export const SKY_PICKS = [
  { id: 'sunny', emoji: '☀️', label: 'Sunny' },
  { id: 'partly', emoji: '⛅', label: 'Partly cloudy' },
  { id: 'cloudy', emoji: '☁️', label: 'Cloudy' },
  { id: 'fog', emoji: '🌫️', label: 'Foggy' },
  { id: 'rain', emoji: '🌧️', label: 'Rainy' },
  { id: 'storm', emoji: '⛈️', label: 'Stormy' },
  { id: 'snow', emoji: '🌨️', label: 'Snowy' },
];
export const SKY = Object.fromEntries(SKY_PICKS.map((s) => [s.id, s]));
export const WIND_PICKS = [
  { id: 'calm', emoji: '🍃', label: 'Calm' },
  { id: 'breezy', emoji: '🌬️', label: 'Breezy' },
  { id: 'windy', emoji: '💨', label: 'Windy' },
];
