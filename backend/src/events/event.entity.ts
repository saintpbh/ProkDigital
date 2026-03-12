import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { FileRecord } from '../files/file.entity';
import { LinkRecord } from './link.entity';

@Entity()
export class Event {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    passcode: string;

    @Column({ unique: true })
    token: string;

    @Column({ default: true })
    is_active: boolean;

    @Column({ type: 'text', nullable: true })
    current_announcement: string | null;

    @CreateDateColumn()
    created_at: Date;

    @OneToMany(() => FileRecord, (file) => file.event)
    files: FileRecord[];

    @OneToMany(() => LinkRecord, (link) => link.event)
    links: LinkRecord[];
}
