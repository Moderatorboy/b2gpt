import skills from "./skills.json";

export default function Skills() {
  return (
    <div className="skills">
      {skills.map((skill, index) => (
        <div key={index} className="skill">
          <img 
            src={skill.icon} 
            alt={skill.name} 
            width={skill.width} 
            height={skill.height} 
          />
          <p>{skill.name}</p>
        </div>
      ))}
    </div>
  );
}
