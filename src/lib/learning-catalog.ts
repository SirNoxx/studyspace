export const topicCategories = [
  "History",
  "Mathematics",
  "Science",
  "Computer science",
] as const;
export type TopicCategory = (typeof topicCategories)[number];
export interface LearningTopic {
  id: string;
  title: string;
  category: TopicCategory;
  sourceUrl?: string;
  sourceId?: number;
}
// Original editorial selection. Article text is not copied into this catalog.
const titles: Record<TopicCategory, string> = {
  History: `Agricultural revolution|Ancient Mesopotamia|Sumerian city-states|Cuneiform writing|Code of Hammurabi|Ancient Egyptian architecture|The Nile and Egyptian agriculture|Indus Valley civilization|Shang dynasty|Zhou dynasty|Silk Road trade|Ancient Greek democracy|Spartan society|Athenian philosophy|Alexander the Great|Roman Republic|Roman engineering|Fall of the Western Roman Empire|Byzantine Empire|Justinian's legal reforms|Islamic Golden Age|House of Wisdom|Trans-Saharan trade|Kingdom of Mali|Mansa Musa|Great Zimbabwe|Kingdom of Aksum|Swahili coast trade|Viking exploration|Medieval monasteries|Feudalism|Magna Carta|The Black Death|Printing press|Italian Renaissance|Scientific Revolution|Protestant Reformation|Mughal Empire|Ottoman Empire|Safavid Empire|Ming maritime expeditions|Tokugawa Japan|Mongol Empire|Inca road system|Maya mathematics|Aztec agriculture|Polynesian navigation|Columbian Exchange|Atlantic slave trade|Haitian Revolution|American Revolution|French Revolution|Industrial Revolution|History of labor unions|Abolitionism|Women's suffrage|Meiji Restoration|Indian independence movement|Decolonization in Africa|Origins of World War I|League of Nations|Great Depression|Origins of World War II|The Holocaust|Formation of the United Nations|Cold War|Space Race|Civil rights movement|Fall of the Berlin Wall|History of public health|History of cartography|History of calendars|Oral history methods|Archaeological dating|Evaluating primary sources|Historical causation|History of money|History of universities|History of vaccines|History of the internet`,
  Mathematics: `Prime numbers|Euclid's algorithm|Modular arithmetic|Fundamental theorem of arithmetic|Congruence relations|Chinese remainder theorem|Fermat's little theorem|Mathematical induction|Proof by contradiction|Pigeonhole principle|Set theory|Functions and mappings|Equivalence relations|Counting permutations|Counting combinations|Binomial theorem|Inclusion-exclusion principle|Pascal's triangle|Fibonacci numbers|Golden ratio|Complex numbers|Euler's formula|Polynomial roots|Linear equations|Vectors|Matrix multiplication|Determinants|Eigenvalues and eigenvectors|Vector spaces|Linear transformations|Orthogonality|Least squares|Limits|Continuity|Derivatives|Chain rule|Implicit differentiation|Definite integrals|Fundamental theorem of calculus|Integration by parts|Infinite series|Taylor series|Differential equations|Partial derivatives|Gradient descent|Probability spaces|Conditional probability|Bayes' theorem|Random variables|Expected value|Variance|Normal distribution|Binomial distribution|Poisson distribution|Law of large numbers|Central limit theorem|Confidence intervals|Hypothesis testing|Correlation and causation|Markov chains|Graph theory|Eulerian paths|Hamiltonian cycles|Graph coloring|Trees in mathematics|Group theory|Symmetry|Topology|Non-Euclidean geometry|Pythagorean theorem|Trigonometric identities|Conic sections|Fractals|Chaos theory|Game theory|Nash equilibrium|Linear programming|Numerical approximation|Information entropy|Cryptographic number theory`,
  Science: `Scientific method|Designing controlled experiments|Measurement uncertainty|Dimensional analysis|Newton's laws of motion|Conservation of momentum|Conservation of energy|Gravity|Orbital mechanics|Waves and interference|Sound and resonance|Electromagnetic spectrum|Electric fields|Magnetic fields|Electromagnetic induction|Ohm's law|Capacitance|Semiconductors|Thermodynamic laws|Heat transfer|Entropy in physics|Special relativity|General relativity|Quantum superposition|Wave-particle duality|Atomic structure|Periodic table|Chemical bonding|Acids and bases|Oxidation and reduction|Chemical equilibrium|Reaction kinetics|Catalysts|Organic functional groups|Polymers|Electrochemistry|Water chemistry|Cell structure|Cell membranes|Cellular respiration|Photosynthesis|DNA replication|Gene expression|Protein folding|Enzymes|Mitosis and meiosis|Mendelian genetics|Natural selection|Genetic drift|Speciation|Evolutionary trees|Microbiomes|Immune system|Vaccination|Neurons and synapses|Memory formation|Circadian rhythms|Ecosystems|Food webs|Carbon cycle|Nitrogen cycle|Biodiversity|Plate tectonics|Rock cycle|Volcanoes|Earthquakes|Weather systems|Ocean currents|Greenhouse effect|Climate feedback loops|Star formation|Stellar evolution|Black holes|Exoplanets|Cosmic expansion|Dark matter|Radioactive decay|Radiometric dating|Spectroscopy|Remote sensing`,
  "Computer science": `How GitHub works|How programming languages are made|Version control with Git|Git branches and merging|Pull requests and code review|Compiler stages|Lexical analysis|Parsing and syntax trees|Interpreters|Type systems|Static and dynamic typing|Memory management|Garbage collection|Stack and heap memory|Pointers|Recursion|Data structures|Arrays and linked lists|Hash tables|Stacks and queues|Binary search trees|Balanced trees|Heaps|Graph traversal|Breadth-first search|Depth-first search|Dijkstra's algorithm|Sorting algorithms|Binary search|Big O notation|Dynamic programming|Greedy algorithms|Divide and conquer|Computability|Turing machines|Halting problem|Finite state machines|Regular expressions|Boolean logic|Digital logic gates|CPU architecture|Instruction sets|Assembly language|Operating systems|Processes and threads|Concurrency|Race conditions|Deadlocks|Virtual memory|File systems|Network protocols|TCP and UDP|DNS|HTTP and HTTPS|TLS encryption|Public-key cryptography|Password hashing|Authentication and authorization|SQL queries|Database indexes|Database transactions|Database normalization|Distributed systems|Consensus algorithms|CAP theorem|Caching|Load balancing|Message queues|REST APIs|WebSockets|Event loops|Functional programming|Object-oriented programming|Software testing|Continuous integration|Containers and virtual machines|Accessibility engineering|Machine learning fundamentals|Neural networks|How search engines work`,
};
export const topicKey = (title: string) =>
  title
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const learningCatalog: LearningTopic[] = topicCategories.flatMap(
  (category) =>
    titles[category]
      .split("|")
      .map((title) => ({
        id: "starter:" + topicKey(title).replaceAll(" ", "-"),
        title,
        category,
      })),
);
export function randomIndex(length: number) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 0xffffffff)
    throw Error("No topics available.");
  const limit = Math.floor(0x100000000 / length) * length,
    value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % length;
}
